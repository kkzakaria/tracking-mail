# 📧 API de synchronisation et suivi des emails

## Vue d'ensemble

Le système de synchronisation permet de suivre les emails envoyés depuis les boîtes configurées et d'identifier automatiquement ceux qui n'ont pas reçu de réponse pour effectuer des relances.

## Architecture

- **Synchronisation en temps réel** : Utilise directement Microsoft Graph API
- **Pas de stockage local** : Les emails sont récupérés à la demande
- **Détection intelligente** : Analyse des conversations pour identifier les emails sans réponse
- **Relances automatiques** : Templates et envoi automatisé

## APIs disponibles

### 1. Synchronisation d'une boîte email

```http
POST /api/admin/mailboxes/[id]/sync
Authorization: Bearer <token_admin>
```

**Réponse :**
```json
{
  "success": true,
  "data": {
    "messageCount": 45,
    "recentMessages": [...],
    "syncedAt": "2025-01-17T18:00:00Z",
    "emailAddress": "abdoulouedraogo@karta-trans.ci"
  },
  "message": "Synchronisation réussie : 45 messages trouvés"
}
```

### 2. Récupération des messages pour un utilisateur

```http
GET /api/user/mailbox/[id]/messages?limit=20&unreadOnly=false&page=1
Authorization: Bearer <token_user>
```

**Paramètres :**
- `limit` (optionnel) : Nombre de messages (max 100, défaut 20)
- `unreadOnly` (optionnel) : Filtrer uniquement les non lus (défaut false)
- `page` (optionnel) : Page de pagination (défaut 1)

**Réponse :**
```json
{
  "success": true,
  "data": {
    "messages": [...],
    "mailbox": {
      "id": "uuid",
      "emailAddress": "email@domain.com",
      "displayName": "Nom Utilisateur",
      "syncStatus": "completed",
      "syncEnabled": true
    },
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "hasMore": true
    },
    "permission": "read"
  }
}
```

### 3. 🎯 Détection des emails sans réponse

```http
GET /api/admin/mailboxes/[id]/sent-without-reply?days=3&limit=50
Authorization: Bearer <token_admin>
```

**Paramètres :**
- `days` (optionnel) : Nombre de jours sans réponse (défaut 3)
- `limit` (optionnel) : Nombre maximum de résultats (défaut 50)

**Réponse :**
```json
{
  "success": true,
  "data": {
    "emailsWithoutReply": [
      {
        "id": "message_id",
        "subject": "Proposition commerciale",
        "from": {
          "emailAddress": {
            "address": "sender@company.com",
            "name": "Nom Expéditeur"
          }
        },
        "receivedDateTime": "2025-01-14T10:30:00Z",
        "bodyPreview": "Aperçu du message...",
        "conversationId": "conversation_id",
        "daysSinceLastSent": 3,
        "needsFollowUp": true
      }
    ],
    "totalAnalyzed": 150,
    "mailbox": {
      "id": "uuid",
      "emailAddress": "email@domain.com",
      "displayName": "Nom Utilisateur"
    },
    "criteria": {
      "daysWithoutReply": 3,
      "analyzedPeriod": "30 jours",
      "cutoffDate": "2025-01-14T18:00:00Z"
    }
  },
  "message": "12 emails trouvés nécessitant une relance"
}
```

### 4. 🚀 Envoi de relances automatiques

```http
POST /api/admin/mailboxes/[id]/send-followup
Authorization: Bearer <token_admin>
Content-Type: application/json

{
  "originalMessageId": "message_id",
  "originalSubject": "Proposition commerciale",
  "recipientEmail": "client@company.com",
  "daysSince": 3,
  "customMessage": "Message personnalisé (optionnel)",
  "importance": "normal"
}
```

**Réponse :**
```json
{
  "success": true,
  "data": {
    "messageId": "original_message_id",
    "followUpSubject": "Relance: Proposition commerciale",
    "recipient": "client@company.com",
    "sentAt": "2025-01-17T18:00:00Z",
    "daysSinceOriginal": 3
  },
  "message": "Relance envoyée avec succès à client@company.com"
}
```

## Logique de détection des emails sans réponse

### Algorithme d'analyse

1. **Groupement par conversation** : Utilise `conversationId` pour regrouper les emails liés
2. **Identification des emails envoyés** : Filtre les messages où l'expéditeur correspond à la boîte suivie
3. **Recherche de réponses** : Vérifie s'il y a eu des messages après l'email envoyé
4. **Calcul des délais** : Détermine le nombre de jours depuis l'envoi sans réponse

### Critères de sélection

- ✅ Email envoyé depuis la boîte configurée
- ✅ Aucune réponse reçue après l'envoi
- ✅ Délai configurable dépassé (défaut 3 jours)
- ✅ Analyse sur les 30 derniers jours

## Templates de relance

### Relance douce (≤ 7 jours)
```html
<p>Bonjour,</p>
<p>J'espère que vous allez bien. Je me permets de revenir vers vous concernant mon message précédent au sujet de : <strong>[SUJET]</strong></p>
<p>Je serais ravi d'avoir votre retour à ce sujet...</p>
```

### Relance urgente (> 7 jours)
```html
<p>Bonjour,</p>
<p>Je me permets de vous relancer concernant mon message du [DATE] au sujet de : <strong>[SUJET]</strong></p>
<p>Votre retour serait très apprécié pour pouvoir avancer sur ce dossier...</p>
```

## Permissions

- **Admin** : Accès complet à toutes les APIs
- **Utilisateur** : Accès uniquement aux boîtes assignées
- **Logs** : Toutes les actions sont enregistrées dans `user_activity_logs`

## Variables d'environnement requises

```env
MICROSOFT_CLIENT_ID=your_client_id
MICROSOFT_CLIENT_SECRET=your_client_secret
MICROSOFT_TENANT_ID=your_tenant_id
```

## Permissions Microsoft Graph requises

- `Mail.Read` : Lecture des emails
- `Mail.Send` : Envoi des relances
- `User.Read.All` : Validation des utilisateurs
- `Directory.Read.All` : Accès au répertoire

---

## 🎯 Cas d'usage principal : Suivi des relances commerciales

1. **Configuration** : Ajouter les boîtes emails des commerciaux
2. **Synchronisation** : Récupérer les emails envoyés
3. **Détection** : Identifier les prospects sans réponse
4. **Relance** : Envoyer automatiquement des follow-ups
5. **Suivi** : Tracker l'efficacité des relances