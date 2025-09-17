-- Migration 0002: Système d'authentification utilisateur Supabase
-- Sépare l'authentification utilisateur de Microsoft Graph
-- Date: 2024-12-17

-- ================================
-- Tables pour l'authentification utilisateur Supabase
-- ================================

-- Table des profils utilisateurs (étend auth.users de Supabase)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'manager')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_active ON public.user_profiles(is_active);

-- ================================
-- Tables pour l'assignation des boîtes emails
-- ================================

-- Table des boîtes emails disponibles (configurées par l'admin)
CREATE TABLE IF NOT EXISTS public.mailboxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_address TEXT NOT NULL UNIQUE,
    display_name TEXT,
    description TEXT,
    mailbox_type TEXT DEFAULT 'user' CHECK (mailbox_type IN ('user', 'shared', 'group')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    sync_enabled BOOLEAN NOT NULL DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'completed', 'error')),
    sync_error TEXT,
    configuration JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_mailboxes_email ON public.mailboxes(email_address);
CREATE INDEX IF NOT EXISTS idx_mailboxes_active ON public.mailboxes(is_active);
CREATE INDEX IF NOT EXISTS idx_mailboxes_sync_status ON public.mailboxes(sync_status);

-- ================================
-- Table d'assignation des boîtes aux utilisateurs
-- ================================

CREATE TABLE IF NOT EXISTS public.user_mailbox_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    mailbox_id UUID NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
    permission_level TEXT NOT NULL DEFAULT 'read' CHECK (permission_level IN ('read', 'read_write', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    assigned_by UUID REFERENCES public.user_profiles(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Contrainte unique : un utilisateur ne peut être assigné qu'une fois par boîte
    UNIQUE(user_id, mailbox_id)
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_assignments_user ON public.user_mailbox_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_mailbox ON public.user_mailbox_assignments(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_assignments_active ON public.user_mailbox_assignments(is_active);
CREATE INDEX IF NOT EXISTS idx_assignments_permission ON public.user_mailbox_assignments(permission_level);

-- ================================
-- Table de configuration Microsoft Graph (administrative)
-- ================================

CREATE TABLE IF NOT EXISTS public.microsoft_graph_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret_encrypted TEXT NOT NULL, -- Chiffré côté application
    is_active BOOLEAN NOT NULL DEFAULT false,
    last_token_refresh TIMESTAMPTZ,
    token_expires_at TIMESTAMPTZ,
    configuration_status TEXT DEFAULT 'pending' CHECK (configuration_status IN ('pending', 'configured', 'error', 'disabled')),
    error_message TEXT,
    configured_by UUID REFERENCES public.user_profiles(id),
    configured_at TIMESTAMPTZ,
    permissions_granted JSONB DEFAULT '[]'::jsonb,
    rate_limit_info JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_graph_config_active ON public.microsoft_graph_config(is_active);
CREATE INDEX IF NOT EXISTS idx_graph_config_status ON public.microsoft_graph_config(configuration_status);

-- ================================
-- Table des logs d'activité utilisateur
-- ================================

CREATE TABLE IF NOT EXISTS public.user_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    activity_type TEXT NOT NULL CHECK (activity_type IN (
        'login', 'logout', 'mailbox_access', 'email_read', 'email_send',
        'assignment_changed', 'profile_updated', 'admin_action'
    )),
    activity_description TEXT,
    resource_id UUID, -- ID de la ressource concernée (mailbox, email, etc.)
    resource_type TEXT, -- Type de ressource (mailbox, email, etc.)
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON public.user_activity_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON public.user_activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON public.user_activity_logs(resource_id, resource_type);

-- ================================
-- Fonctions utilitaires
-- ================================

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour updated_at
CREATE TRIGGER trigger_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_mailboxes_updated_at
    BEFORE UPDATE ON public.mailboxes
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_user_mailbox_assignments_updated_at
    BEFORE UPDATE ON public.user_mailbox_assignments
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trigger_microsoft_graph_config_updated_at
    BEFORE UPDATE ON public.microsoft_graph_config
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ================================
-- Fonction pour créer automatiquement un profil utilisateur
-- ================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger pour créer automatiquement un profil lors de l'inscription
CREATE TRIGGER trigger_create_user_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================
-- Fonctions de nettoyage
-- ================================

-- Nettoyer les logs anciens (30 jours par défaut)
CREATE OR REPLACE FUNCTION public.cleanup_old_activity_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.user_activity_logs
    WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Nettoyer les assignations expirées
CREATE OR REPLACE FUNCTION public.cleanup_expired_assignments()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE public.user_mailbox_assignments
    SET is_active = false
    WHERE expires_at IS NOT NULL
      AND expires_at < NOW()
      AND is_active = true;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ================================
-- Row Level Security (RLS)
-- ================================

-- Activer RLS sur toutes les tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mailbox_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microsoft_graph_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Politiques pour user_profiles
CREATE POLICY "Users can read their own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles" ON public.user_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Politiques pour mailboxes
CREATE POLICY "Users can read assigned mailboxes" ON public.mailboxes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_mailbox_assignments uma
            WHERE uma.mailbox_id = id
              AND uma.user_id = auth.uid()
              AND uma.is_active = true
        )
    );

CREATE POLICY "Admins can manage all mailboxes" ON public.mailboxes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Politiques pour user_mailbox_assignments
CREATE POLICY "Users can read their own assignments" ON public.user_mailbox_assignments
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all assignments" ON public.user_mailbox_assignments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Politiques pour microsoft_graph_config (admin seulement)
CREATE POLICY "Only admins can access Graph config" ON public.microsoft_graph_config
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Politiques pour user_activity_logs
CREATE POLICY "Users can read their own activity logs" ON public.user_activity_logs
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can read all activity logs" ON public.user_activity_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Service can insert activity logs" ON public.user_activity_logs
    FOR INSERT WITH CHECK (true);

-- ================================
-- Vues utilitaires
-- ================================

-- Vue pour les assignations actives avec détails
CREATE OR REPLACE VIEW public.active_user_assignments AS
SELECT
    uma.id,
    uma.user_id,
    up.email as user_email,
    up.full_name as user_name,
    uma.mailbox_id,
    m.email_address as mailbox_email,
    m.display_name as mailbox_name,
    uma.permission_level,
    uma.assigned_at,
    uma.expires_at,
    uma.notes
FROM public.user_mailbox_assignments uma
JOIN public.user_profiles up ON uma.user_id = up.id
JOIN public.mailboxes m ON uma.mailbox_id = m.id
WHERE uma.is_active = true
  AND up.is_active = true
  AND m.is_active = true
  AND (uma.expires_at IS NULL OR uma.expires_at > NOW());

-- Vue pour les statistiques utilisateur
CREATE OR REPLACE VIEW public.user_stats AS
SELECT
    up.id,
    up.email,
    up.full_name,
    up.role,
    COUNT(uma.id) as assigned_mailboxes_count,
    COUNT(CASE WHEN uma.permission_level = 'read_write' THEN 1 END) as write_permissions_count,
    up.created_at as user_since
FROM public.user_profiles up
LEFT JOIN public.user_mailbox_assignments uma ON up.id = uma.user_id AND uma.is_active = true
WHERE up.is_active = true
GROUP BY up.id, up.email, up.full_name, up.role, up.created_at;

-- ================================
-- Données de test (optionnel en développement)
-- ================================

-- Insérer un admin par défaut (à adapter selon vos besoins)
-- NOTE: Ceci ne sera exécuté que si aucun admin n'existe
DO $$
BEGIN
    -- Cette section sera commentée en production
    -- INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    -- VALUES (gen_random_uuid(), 'admin@tracking-mail.com', crypt('admin123', gen_salt('bf')), NOW(), NOW(), NOW())
    -- ON CONFLICT (email) DO NOTHING;
END $$;

-- ================================
-- Commentaires pour la documentation
-- ================================

COMMENT ON TABLE public.user_profiles IS 'Profils utilisateurs étendus liés à auth.users de Supabase';
COMMENT ON TABLE public.mailboxes IS 'Boîtes emails disponibles dans le système';
COMMENT ON TABLE public.user_mailbox_assignments IS 'Assignations des boîtes emails aux utilisateurs';
COMMENT ON TABLE public.microsoft_graph_config IS 'Configuration Microsoft Graph (admin uniquement)';
COMMENT ON TABLE public.user_activity_logs IS 'Logs d''activité des utilisateurs';

COMMENT ON COLUMN public.user_profiles.role IS 'Rôle utilisateur: user, admin, manager';
COMMENT ON COLUMN public.mailboxes.mailbox_type IS 'Type de boîte: user, shared, group';
COMMENT ON COLUMN public.user_mailbox_assignments.permission_level IS 'Niveau de permission: read, read_write, admin';
COMMENT ON COLUMN public.microsoft_graph_config.client_secret_encrypted IS 'Secret client chiffré côté application';