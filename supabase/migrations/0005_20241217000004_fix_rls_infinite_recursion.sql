-- Migration 0005: Correction de la récursion infinie dans les politiques RLS
-- Problème: Les politiques qui vérifient le rôle dans user_profiles créent une boucle infinie
-- Date: 2024-12-17

-- ================================
-- Suppression des politiques problématiques
-- ================================

-- Supprimer les politiques qui créent une récursion infinie
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can manage all mailboxes" ON public.mailboxes;
DROP POLICY IF EXISTS "Admins can manage all assignments" ON public.user_mailbox_assignments;
DROP POLICY IF EXISTS "Only admins can access Graph config" ON public.microsoft_graph_config;
DROP POLICY IF EXISTS "Admins can read all activity logs" ON public.user_activity_logs;

-- ================================
-- Politiques corrigées pour user_profiles
-- ================================

-- Politique de base : les utilisateurs peuvent lire leur propre profil
CREATE POLICY "Users can read their own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

-- Politique de base : les utilisateurs peuvent modifier leur propre profil
CREATE POLICY "Users can update their own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Permettre aux utilisateurs authentifiés de lire les profils (nécessaire pour vérifier les rôles)
-- Cette politique évite la récursion en ne faisant pas de requête sur user_profiles
CREATE POLICY "Authenticated users can read profiles for role checks" ON public.user_profiles
    FOR SELECT USING (auth.role() = 'authenticated');

-- ================================
-- Politiques administratives avec service_role
-- ================================

-- Les opérations admin utilisent maintenant le service_role au lieu de vérifier dans user_profiles
CREATE POLICY "Service role can manage all profiles" ON public.user_profiles
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all mailboxes" ON public.mailboxes
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all assignments" ON public.user_mailbox_assignments
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access Graph config" ON public.microsoft_graph_config
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all activity logs" ON public.user_activity_logs
    FOR ALL USING (auth.role() = 'service_role');

-- ================================
-- Commentaire de migration
-- ================================

COMMENT ON SCHEMA public IS 'Migration 0005: Correction de la récursion infinie dans les politiques RLS. Les politiques admin utilisent maintenant auth.role() = ''service_role'' au lieu de vérifier le rôle dans user_profiles, évitant ainsi la boucle infinie.';