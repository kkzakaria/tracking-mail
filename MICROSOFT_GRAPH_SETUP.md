# Microsoft Graph Authentication Setup Guide

Ce guide explique comment configurer et utiliser le système d'authentification Microsoft Graph dans votre application Next.js/Supabase.

## Table des Matières

1. [Configuration Azure AD](#configuration-azure-ad)
2. [Variables d'Environnement](#variables-denvironnement)
3. [Installation et Configuration](#installation-et-configuration)
4. [Utilisation](#utilisation)
5. [Sécurité](#sécurité)
6. [Monitoring et Logs](#monitoring-et-logs)
7. [Troubleshooting](#troubleshooting)

## Configuration Azure AD

### 1. Créer une Application Azure AD

1. Connectez-vous au [Azure Portal](https://portal.azure.com)
2. Naviguez vers **Azure Active Directory** > **App registrations**
3. Cliquez sur **New registration**
4. Configurez votre application :
   - **Name**: `tracking-mail-app`
   - **Supported account types**: Choisissez selon vos besoins
   - **Redirect URI**: `http://localhost:3000/api/auth/microsoft/callback` (pour le développement)

### 2. Configurer les Permissions

Dans votre application Azure AD :

1. Allez dans **API permissions**
2. Ajoutez ces permissions **Application** (pas délégué) :
   - `Mail.Read` - Lire les emails de tous les utilisateurs
   - `Mail.ReadWrite` - Lire et écrire les emails
   - `User.Read.All` - Lire les profils utilisateurs
   - `Calendars.Read` - Lire les calendriers
   - `Directory.Read.All` - Lire les informations d'annuaire

3. **Important**: Cliquez sur **Grant admin consent** pour approuver les permissions

### 3. Créer un Client Secret

1. Allez dans **Certificates & secrets**
2. Cliquez sur **New client secret**
3. Donnez une description et choisissez l'expiration
4. **Copiez immédiatement la valeur** - elle ne sera plus affichée

### 4. Noter les Informations

Vous aurez besoin de :
- **Application (client) ID**
- **Directory (tenant) ID**
- **Client secret** (la valeur que vous venez de copier)

## Variables d'Environnement

Créez un fichier `.env.local` basé sur `.env.example` :

```bash
# Microsoft Graph Configuration
MICROSOFT_CLIENT_ID=votre-client-id
MICROSOFT_CLIENT_SECRET=votre-client-secret
MICROSOFT_TENANT_ID=votre-tenant-id
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/auth/microsoft/callback

# Next.js Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Clé de chiffrement (générez une clé aléatoire de 32+ caractères)
ENCRYPTION_KEY=votre-cle-de-chiffrement-tres-longue-et-securisee

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=votre-url-supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre-cle-anonyme-supabase
SUPABASE_SERVICE_ROLE_KEY=votre-cle-service-supabase
```

### Génération de la Clé de Chiffrement

```bash
# Générer une clé sécurisée
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Installation et Configuration

### 1. Dépendances Installées

Les dépendances suivantes sont déjà installées :

```json
{
  "@azure/msal-node": "^3.7.3",
  "@microsoft/microsoft-graph-client": "^3.0.7",
  "@supabase/supabase-js": "^2.57.4",
  "crypto-js": "^4.2.0",
  "jsonwebtoken": "^9.0.2"
}
```

### 2. Configuration Supabase

Exécutez les migrations pour créer les tables nécessaires :

```bash
# Démarrer Supabase local
supabase start

# Appliquer les migrations
supabase db push

# Ou réinitialiser la base
supabase db reset
```

### 3. Configuration Next.js

Le système est prêt à l'emploi avec la configuration existante.

## Utilisation

### 1. Authentification côté Client

```typescript
'use client';

import { useAuth } from '@/lib/hooks/use-auth';

export default function LoginComponent() {
  const { authenticated, user, loading, login, logout } = useAuth();

  if (loading) return <div>Chargement...</div>;

  if (!authenticated) {
    return (
      <button onClick={login}>
        Se connecter avec Microsoft
      </button>
    );
  }

  return (
    <div>
      <h1>Bienvenue {user?.displayName}</h1>
      <button onClick={logout}>Se déconnecter</button>
    </div>
  );
}
```

### 2. Utilisation de Microsoft Graph

```typescript
'use client';

import { useUsers, useUserMail } from '@/lib/hooks/use-graph';

export default function GraphExample() {
  const { data: usersData, loading: usersLoading, execute: fetchUsers } = useUsers();
  const { data: mailData, loading: mailLoading, execute: fetchMail } = useUserMail();

  const handleGetUsers = async () => {
    await fetchUsers({ search: 'john', limit: 10 });
  };

  const handleGetMail = async (userId: string) => {
    await fetchMail({ limit: 20, unreadOnly: true });
  };

  return (
    <div>
      <button onClick={handleGetUsers}>
        Charger les utilisateurs
      </button>

      {usersData && (
        <div>
          {usersData.users.map(user => (
            <div key={user.id}>
              <h3>{user.displayName}</h3>
              <button onClick={() => handleGetMail(user.id)}>
                Voir les emails
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 3. API Routes Disponibles

#### Authentification

- `GET /api/auth/microsoft` - Initier la connexion
- `GET /api/auth/microsoft/callback` - Callback OAuth
- `POST /api/auth/microsoft/refresh` - Renouveler le token
- `GET /api/auth/session` - Vérifier la session
- `DELETE /api/auth/session` - Se déconnecter

#### Microsoft Graph

- `GET /api/graph/users` - Liste des utilisateurs
- `GET /api/graph/users/[userId]` - Utilisateur spécifique
- `GET /api/graph/mail/[userId]` - Emails d'un utilisateur
- `POST /api/graph/mail/[userId]` - Envoyer un email
- `GET /api/graph/calendar/[userId]` - Calendrier d'un utilisateur

### 4. Envoi d'Email

```typescript
import { useSendMail } from '@/lib/hooks/use-graph';

export default function SendMailComponent() {
  const { execute: sendMail, loading } = useSendMail();

  const handleSendEmail = async () => {
    await sendMail('user-id', {
      subject: 'Test Email',
      body: '<h1>Hello World</h1><p>Ceci est un test.</p>',
      toRecipients: ['recipient@example.com'],
      ccRecipients: ['cc@example.com'],
      importance: 'normal'
    });
  };

  return (
    <button onClick={handleSendEmail} disabled={loading}>
      {loading ? 'Envoi...' : 'Envoyer Email'}
    </button>
  );
}
```

## Sécurité

### 1. Chiffrement des Tokens

- Les tokens sont chiffrés avec AES-256-GCM avant stockage
- Utilisation d'une clé de chiffrement forte et unique
- Rotation automatique des tokens expirés

### 2. Validation des Sessions

- Vérification automatique de l'expiration des tokens
- Refresh automatique quand nécessaire
- Révocation sécurisée des tokens

### 3. Audit et Logging

- Toutes les tentatives d'authentification sont loggées
- Rate limiting sur les tentatives de connexion
- Monitoring des erreurs et accès suspects

### 4. Row Level Security (RLS)

- Politiques Supabase pour protéger les données
- Accès restreint par utilisateur
- Isolation des données sensibles

## Monitoring et Logs

### 1. Tables de Logs

- `auth_attempts` - Tentatives d'authentification
- `user_sessions` - Sessions actives
- `microsoft_tokens` - Tokens stockés (chiffrés)

### 2. Fonctions de Nettoyage

```sql
-- Nettoyer les tokens expirés
SELECT cleanup_expired_tokens();

-- Nettoyer les anciens logs
SELECT cleanup_old_auth_attempts(30);

-- Nettoyer les sessions expirées
SELECT cleanup_expired_sessions();
```

### 3. Monitoring

Vérifiez régulièrement :
- Taux d'échec d'authentification
- Temps de réponse des API Graph
- Utilisation des quotas Microsoft

## Troubleshooting

### 1. Erreurs Communes

**"Configuration Error"**
- Vérifiez que toutes les variables d'environnement sont définies
- Validez la configuration Azure AD

**"Invalid State Parameter"**
- Problème de cookies ou session
- Vérifiez la configuration HTTPS en production

**"Insufficient Permissions"**
- Vérifiez les permissions Azure AD
- Assurez-vous que l'admin consent est accordé

### 2. Debug Mode

Activez les logs détaillés :

```typescript
// Dans votre configuration
const DEBUG = process.env.NODE_ENV === 'development';

if (DEBUG) {
  console.log('Auth attempt:', { userId, success, error });
}
```

### 3. Rate Limiting

Si vous atteignez les limites :
- Implémentez un cache pour les données fréquentes
- Utilisez la pagination pour les gros volumes
- Ajoutez des délais entre les requêtes

### 4. Production Checklist

Avant la mise en production :

- [ ] Variables d'environnement configurées
- [ ] HTTPS activé
- [ ] Domaines de redirection mis à jour
- [ ] Permissions Azure AD validées
- [ ] Clés de chiffrement sécurisées
- [ ] Monitoring activé
- [ ] Sauvegardes Supabase configurées

## Support

Pour obtenir de l'aide :

1. Vérifiez les logs dans Supabase
2. Consultez la documentation Microsoft Graph
3. Vérifiez les permissions Azure AD
4. Testez avec un utilisateur de test

## Références

- [Microsoft Graph API Documentation](https://docs.microsoft.com/en-us/graph/)
- [Azure AD App Registration](https://docs.microsoft.com/en-us/azure/active-directory/develop/)
- [Supabase Documentation](https://supabase.com/docs)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)