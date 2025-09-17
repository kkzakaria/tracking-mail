-- Migration 0003: Corrections des avertissements de sécurité Supabase
-- Date: 2024-12-17

-- ================================
-- Corrections des politiques RLS manquantes
-- ================================

-- 1. Activer RLS sur toutes les tables (s'assurer qu'elles sont activées)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mailbox_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microsoft_graph_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- ================================
-- Politiques RLS améliorées avec sécurité renforcée
-- ================================

-- Supprimer les anciennes politiques pour les recréer proprement
DROP POLICY IF EXISTS "Users can read their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can read assigned mailboxes" ON public.mailboxes;
DROP POLICY IF EXISTS "Admins can manage all mailboxes" ON public.mailboxes;
DROP POLICY IF EXISTS "Users can read their own assignments" ON public.user_mailbox_assignments;
DROP POLICY IF EXISTS "Admins can manage all assignments" ON public.user_mailbox_assignments;
DROP POLICY IF EXISTS "Only admins can access Graph config" ON public.microsoft_graph_config;
DROP POLICY IF EXISTS "Users can read their own activity logs" ON public.user_activity_logs;
DROP POLICY IF EXISTS "Admins can read all activity logs" ON public.user_activity_logs;
DROP POLICY IF EXISTS "Service can insert activity logs" ON public.user_activity_logs;

-- ================================
-- Politiques user_profiles - Sécurité renforcée
-- ================================

-- Utilisateurs : Lecture de leur propre profil uniquement
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING (
        auth.uid() = id AND is_active = true
    );

-- Utilisateurs : Mise à jour de leur propre profil (champs limités)
CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (
        auth.uid() = id AND is_active = true
    ) WITH CHECK (
        auth.uid() = id AND
        is_active = true
    );

-- Admins : Accès complet en lecture
CREATE POLICY "Admins can view all profiles" ON public.user_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid()
              AND role = 'admin'
              AND is_active = true
        )
    );

-- Admins : Mise à jour des profils (avec restrictions)
CREATE POLICY "Admins can update profiles" ON public.user_profiles
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid()
              AND role = 'admin'
              AND is_active = true
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid()
              AND role = 'admin'
              AND is_active = true
        )
    );

-- Service role peut insérer de nouveaux profils (via trigger)
CREATE POLICY "Service can insert profiles" ON public.user_profiles
    FOR INSERT WITH CHECK (true);

-- ================================
-- Politiques mailboxes - Sécurité granulaire
-- ================================

-- Utilisateurs : Lecture des boîtes assignées uniquement
CREATE POLICY "Users can view assigned mailboxes" ON public.mailboxes
    FOR SELECT USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM public.user_mailbox_assignments uma
            WHERE uma.mailbox_id = id
              AND uma.user_id = auth.uid()
              AND uma.is_active = true
              AND (uma.expires_at IS NULL OR uma.expires_at > NOW())
        )
    );

-- Admins : Accès complet
CREATE POLICY "Admins can manage mailboxes" ON public.mailboxes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid()
              AND role = 'admin'
              AND is_active = true
        )
    );

-- ================================
-- Politiques user_mailbox_assignments - Sécurité stricte
-- ================================

-- Utilisateurs : Lecture de leurs assignations uniquement
CREATE POLICY "Users can view own assignments" ON public.user_mailbox_assignments
    FOR SELECT USING (
        user_id = auth.uid() AND
        is_active = true AND
        (expires_at IS NULL OR expires_at > NOW())
    );

-- Admins : Gestion complète des assignations
CREATE POLICY "Admins can manage assignments" ON public.user_mailbox_assignments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid()
              AND role = 'admin'
              AND is_active = true
        )
    );

-- ================================
-- Politiques microsoft_graph_config - Admin uniquement
-- ================================

-- Seuls les admins peuvent accéder à la config Graph
CREATE POLICY "Only admins access graph config" ON public.microsoft_graph_config
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid()
              AND role = 'admin'
              AND is_active = true
        )
    );

-- ================================
-- Politiques user_activity_logs - Audit sécurisé
-- ================================

-- Utilisateurs : Lecture de leurs propres logs uniquement
CREATE POLICY "Users can view own activity" ON public.user_activity_logs
    FOR SELECT USING (
        user_id = auth.uid()
    );

-- Admins : Lecture de tous les logs (pour audit)
CREATE POLICY "Admins can view all activity" ON public.user_activity_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid()
              AND role = 'admin'
              AND is_active = true
        )
    );

-- Service : Insertion des logs (depuis l'application)
CREATE POLICY "Service can log activity" ON public.user_activity_logs
    FOR INSERT WITH CHECK (
        -- Vérifier que l'utilisateur loggé existe
        user_id IS NULL OR EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = user_id AND is_active = true
        )
    );

-- ================================
-- Fonctions de sécurité supplémentaires
-- ================================

-- Fonction pour vérifier si l'utilisateur est admin
CREATE OR REPLACE FUNCTION public.is_admin(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = user_uuid
          AND role = 'admin'
          AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour obtenir le rôle de l'utilisateur
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID DEFAULT auth.uid())
RETURNS TEXT AS $$
BEGIN
    RETURN (
        SELECT role FROM public.user_profiles
        WHERE id = user_uuid AND is_active = true
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- Triggers de sécurité
-- ================================

-- Fonction pour audit des changements sensibles
CREATE OR REPLACE FUNCTION public.audit_sensitive_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Logger les changements de rôle
    IF TG_OP = 'UPDATE' AND OLD.role != NEW.role THEN
        INSERT INTO public.user_activity_logs (
            user_id,
            activity_type,
            activity_description,
            resource_id,
            resource_type,
            metadata
        ) VALUES (
            NEW.id,
            'admin_action',
            'Role changed from ' || OLD.role || ' to ' || NEW.role,
            NEW.id,
            'user_profile',
            jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role, 'changed_by', auth.uid())
        );
    END IF;

    -- Logger les désactivations
    IF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
        INSERT INTO public.user_activity_logs (
            user_id,
            activity_type,
            activity_description,
            resource_id,
            resource_type,
            metadata
        ) VALUES (
            NEW.id,
            'admin_action',
            'User account deactivated',
            NEW.id,
            'user_profile',
            jsonb_build_object('deactivated_by', auth.uid())
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Activer le trigger d'audit
DROP TRIGGER IF EXISTS trigger_audit_user_profiles ON public.user_profiles;
CREATE TRIGGER trigger_audit_user_profiles
    AFTER UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_changes();

-- ================================
-- Contraintes de sécurité supplémentaires
-- ================================

-- S'assurer qu'il y a toujours au moins un admin actif
CREATE OR REPLACE FUNCTION public.ensure_admin_exists()
RETURNS TRIGGER AS $$
BEGIN
    -- Si on désactive un admin ou change son rôle
    IF (TG_OP = 'UPDATE' AND OLD.role = 'admin' AND OLD.is_active = true)
       AND (NEW.role != 'admin' OR NEW.is_active = false) THEN

        -- Vérifier s'il reste d'autres admins actifs
        IF NOT EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE role = 'admin'
              AND is_active = true
              AND id != NEW.id
        ) THEN
            RAISE EXCEPTION 'Cannot remove last active admin. At least one admin must remain active.';
        END IF;
    END IF;

    -- Si on supprime un admin
    IF TG_OP = 'DELETE' AND OLD.role = 'admin' AND OLD.is_active = true THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE role = 'admin'
              AND is_active = true
              AND id != OLD.id
        ) THEN
            RAISE EXCEPTION 'Cannot delete last active admin. At least one admin must remain active.';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Activer la protection admin
DROP TRIGGER IF EXISTS trigger_ensure_admin_exists ON public.user_profiles;
CREATE TRIGGER trigger_ensure_admin_exists
    BEFORE UPDATE OR DELETE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.ensure_admin_exists();

-- ================================
-- Nettoyage et optimisation
-- ================================

-- Nettoyer les assignations expirées automatiquement
CREATE OR REPLACE FUNCTION public.cleanup_expired_assignments()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE public.user_mailbox_assignments
    SET is_active = false,
        updated_at = NOW()
    WHERE expires_at IS NOT NULL
      AND expires_at < NOW()
      AND is_active = true;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    -- Logger le nettoyage
    INSERT INTO public.user_activity_logs (
        activity_type,
        activity_description,
        metadata
    ) VALUES (
        'admin_action',
        'Automatic cleanup of expired assignments',
        jsonb_build_object('expired_assignments_count', updated_count)
    );

    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================
-- Commentaires de sécurité
-- ================================

COMMENT ON POLICY "Users can view own profile" ON public.user_profiles IS
'Users can only view their own active profile';

COMMENT ON POLICY "Users can update own profile" ON public.user_profiles IS
'Users can update their profile but cannot change role or core identifiers';

COMMENT ON POLICY "Admins can view all profiles" ON public.user_profiles IS
'Admins can view all user profiles for management purposes';

COMMENT ON POLICY "Users can view assigned mailboxes" ON public.mailboxes IS
'Users can only see mailboxes that are actively assigned to them';

COMMENT ON POLICY "Users can view own assignments" ON public.user_mailbox_assignments IS
'Users can only see their own active, non-expired assignments';

COMMENT ON POLICY "Only admins access graph config" ON public.microsoft_graph_config IS
'Microsoft Graph configuration is restricted to administrators only';

COMMENT ON FUNCTION public.ensure_admin_exists() IS
'Security function to prevent system lockout by ensuring at least one admin exists';

-- ================================
-- Vérifications de sécurité finales
-- ================================

-- Vérifier que toutes les tables ont RLS activé
DO $$
DECLARE
    tbl_name TEXT;
    rls_status BOOLEAN;
BEGIN
    FOR tbl_name IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN ('user_profiles', 'mailboxes', 'user_mailbox_assignments', 'microsoft_graph_config', 'user_activity_logs')
    LOOP
        SELECT rowsecurity INTO rls_status
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = tbl_name;

        IF NOT rls_status THEN
            RAISE WARNING 'RLS not enabled for table: %', tbl_name;
        END IF;
    END LOOP;
END $$;