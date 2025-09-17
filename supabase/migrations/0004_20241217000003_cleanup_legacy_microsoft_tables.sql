-- Migration 0004: Nettoyage des tables Microsoft obsolètes
-- Supprime l'ancien système d'authentification Microsoft après séparation architecturale
-- Date: 2024-12-17

-- ================================
-- Suppression des triggers et tables obsolètes
-- ================================

-- Supprimer d'abord les triggers qui dépendent de la fonction
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_microsoft_tokens_updated_at ON microsoft_tokens;

-- Supprimer les anciennes tables Microsoft (ordre important pour les contraintes)
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS auth_attempts CASCADE;
DROP TABLE IF EXISTS microsoft_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ================================
-- Suppression des fonctions devenues orphelines
-- ================================

-- Maintenant on peut supprimer les fonctions qui ne sont plus utilisées
DROP FUNCTION IF EXISTS get_user_with_active_token(TEXT);
DROP FUNCTION IF EXISTS cleanup_expired_tokens();
DROP FUNCTION IF EXISTS cleanup_old_auth_attempts(INTEGER);
DROP FUNCTION IF EXISTS cleanup_expired_sessions();
DROP FUNCTION IF EXISTS update_updated_at_column();

-- ================================
-- Commentaire de migration
-- ================================

COMMENT ON SCHEMA public IS 'Migration 0004: Nettoyage des tables Microsoft obsolètes après séparation architecturale. Système maintenant basé sur Supabase Auth + user_profiles pour les utilisateurs et microsoft_graph_config pour la gestion administrative de Microsoft Graph.';