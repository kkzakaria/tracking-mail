-- Migration 0006: Suppression de la table microsoft_graph_config
-- La configuration Microsoft Graph utilise maintenant directement les variables d'environnement

-- Supprimer les politiques RLS liées à la table
DROP POLICY IF EXISTS "Only admins access graph config" ON public.microsoft_graph_config;
DROP POLICY IF EXISTS "Service role can access Graph config" ON public.microsoft_graph_config;

-- Supprimer les triggers
DROP TRIGGER IF EXISTS trigger_microsoft_graph_config_updated_at ON public.microsoft_graph_config;

-- Supprimer les index
DROP INDEX IF EXISTS idx_graph_config_active;
DROP INDEX IF EXISTS idx_graph_config_status;

-- Supprimer la table
DROP TABLE IF EXISTS public.microsoft_graph_config CASCADE;

-- Commentaire de migration
COMMENT ON SCHEMA public IS 'Migration 0006: Suppression de la table microsoft_graph_config obsolète. La configuration Microsoft Graph utilise maintenant directement les variables d''environnement pour une approche plus sécurisée et simplifiée.';