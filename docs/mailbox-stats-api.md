# API de Statistiques de Boîte Email

## Description

Cette API permet de récupérer des statistiques détaillées pour une boîte email spécifique, incluant :
- Nombre total de messages
- Messages non lus / lus
- Messages sans réponse (utilise Microsoft Graph PidTagMessageStatus)
- Statistiques par dossier
- Échantillon de messages sans réponse

## Endpoint

```
GET /api/admin/mailboxes/{id}/stats
```

## Authentification

Nécessite un rôle administrateur. Inclure le token d'authentification dans l'en-tête :

```
Authorization: Bearer {your-admin-token}
```

## Paramètres de Requête

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|--------|--------|-------------|
| `startDate` | string (ISO 8601) | Non | - | Date de début de la période à analyser |
| `endDate` | string (ISO 8601) | Non | - | Date de fin de la période à analyser |
| `includeFolders` | boolean | Non | - | Inclure les statistiques détaillées par dossier |
| `includeUnanswered` | boolean | Non | true | Calculer les messages sans réponse (peut prendre plus de temps) |
| `includeUnansweredSample` | boolean | Non | - | Inclure un échantillon de messages sans réponse (max 20) |
| `onlyUserFolders` | boolean | Non | true | Exclure les dossiers système (corbeille, spam, etc.) |
| `quick` | boolean | Non | - | Mode rapide sans calcul des messages sans réponse |

## Exemples d'Utilisation

### 1. Mode Rapide

Mode rapide - Statistiques de base sans calcul des messages sans réponse

**Requête :**
```http
GET /api/admin/mailboxes/{id}/stats?quick=true
Authorization: Bearer {your-admin-token}
Content-Type: application/json
```

**Réponse :**
```json
{
  "emailAddress": "service-exploitation@karta-transit.ci",
  "mailboxId": "dcc8512f-1411-45d0-a161-721c2eacb5bd",
  "mailboxName": "service expoitation karta transit",
  "totalMessages": 1247,
  "unreadMessages": 23,
  "folders": [
    {
      "id": "AAMkAGY3...inbox",
      "displayName": "Boîte de réception",
      "totalMessages": 1100,
      "unreadMessages": 20,
      "wellKnownName": "inbox"
    },
    {
      "id": "AAMkAGY3...sent",
      "displayName": "Éléments envoyés",
      "totalMessages": 147,
      "unreadMessages": 0,
      "wellKnownName": "sentitems"
    }
  ],
  "mode": "quick",
  "generatedAt": "2024-09-18T11:00:00.000Z"
}
```

### 2. Statistiques pour une Période

Statistiques pour une période donnée avec messages sans réponse

**Requête :**
```http
GET /api/admin/mailboxes/{id}/stats?startDate=2024-01-01T00:00:00.000Z&endDate=2024-12-31T23:59:59.999Z&includeUnanswered=true
Authorization: Bearer {your-admin-token}
Content-Type: application/json
```

**Réponse :**
```json
{
  "emailAddress": "service-exploitation@karta-transit.ci",
  "mailboxId": "dcc8512f-1411-45d0-a161-721c2eacb5bd",
  "mailboxName": "service expoitation karta transit",
  "totalMessages": 892,
  "unreadMessages": 15,
  "readMessages": 877,
  "unansweredMessages": 47,
  "answeredMessages": 845,
  "period": {
    "startDate": "2024-01-01T00:00:00.000Z",
    "endDate": "2024-12-31T23:59:59.999Z",
    "description": "Du 1 janvier 2024 au 31 décembre 2024"
  },
  "generatedAt": "2024-09-18T11:00:00.000Z",
  "parameters": {
    "startDate": "2024-01-01T00:00:00.000Z",
    "endDate": "2024-12-31T23:59:59.999Z",
    "includeFolders": false,
    "includeUnanswered": true,
    "includeUnansweredSample": false,
    "onlyUserFolders": true
  },
  "summary": {
    "periodDays": 365,
    "responseRate": 95,
    "readRate": 98
  }
}
```

### 3. Statistiques Complètes

Statistiques complètes avec échantillon de messages sans réponse et détails par dossier

**Requête :**
```http
GET /api/admin/mailboxes/{id}/stats?startDate=2024-09-01T00:00:00.000Z&endDate=2024-09-30T23:59:59.999Z&includeFolders=true&includeUnansweredSample=true
Authorization: Bearer {your-admin-token}
Content-Type: application/json
```

**Réponse :**
```json
{
  "emailAddress": "service-exploitation@karta-transit.ci",
  "mailboxId": "dcc8512f-1411-45d0-a161-721c2eacb5bd",
  "mailboxName": "service expoitation karta transit",
  "totalMessages": 127,
  "unreadMessages": 3,
  "readMessages": 124,
  "unansweredMessages": 8,
  "answeredMessages": 119,
  "period": {
    "startDate": "2024-09-01T00:00:00.000Z",
    "endDate": "2024-09-30T23:59:59.999Z",
    "description": "Du 1 septembre 2024 au 30 septembre 2024"
  },
  "folders": [
    {
      "id": "AAMkAGY3...inbox",
      "displayName": "Boîte de réception",
      "totalMessages": 115,
      "unreadMessages": 3,
      "unansweredMessages": 7,
      "wellKnownName": "inbox"
    },
    {
      "id": "AAMkAGY3...drafts",
      "displayName": "Brouillons",
      "totalMessages": 2,
      "unreadMessages": 0,
      "unansweredMessages": 1,
      "wellKnownName": "drafts"
    }
  ],
  "sampleUnanswered": [
    {
      "id": "AAMkAGY3OTE2...",
      "subject": "Demande d'information sur les horaires",
      "from": {
        "name": "Jean Dupont",
        "address": "jean.dupont@client-karta.ci"
      },
      "receivedDateTime": "2024-09-16T14:30:00.000Z",
      "conversationId": "AAQkADAwATM0...",
      "importance": "normal",
      "daysSinceReceived": 2
    },
    {
      "id": "AAMkAGY3OTE3...",
      "subject": "Problème de paiement carte Karta",
      "from": {
        "name": "Marie Kouassi",
        "address": "marie.kouassi@gmail.com"
      },
      "receivedDateTime": "2024-09-15T09:15:00.000Z",
      "conversationId": "AAQkADAwATM1...",
      "importance": "high",
      "daysSinceReceived": 3
    }
  ],
  "generatedAt": "2024-09-18T11:00:00.000Z",
  "parameters": {
    "startDate": "2024-09-01T00:00:00.000Z",
    "endDate": "2024-09-30T23:59:59.999Z",
    "includeFolders": true,
    "includeUnanswered": true,
    "includeUnansweredSample": true,
    "onlyUserFolders": true
  },
  "summary": {
    "periodDays": 30,
    "responseRate": 94,
    "readRate": 98
  }
}
```

## Gestion des Erreurs

L'API retourne des codes d'erreur HTTP standards avec des messages explicites :


### Non authentifié (401)

**Requête :** `/api/admin/mailboxes/{id}/stats`

**Réponse :**
```json
{
  "error": "Non authentifié"
}
```

### Accès refusé (non admin) (403)

**Requête :** `/api/admin/mailboxes/{id}/stats`

**Réponse :**
```json
{
  "error": "Accès refusé. Rôle administrateur requis."
}
```

### Boîte email non trouvée (404)

**Requête :** `/api/admin/mailboxes/invalid-id/stats`

**Réponse :**
```json
{
  "error": "Boîte email non trouvée"
}
```

### Date invalide (400)

**Requête :** `/api/admin/mailboxes/{id}/stats?startDate=invalid-date`

**Réponse :**
```json
{
  "error": "Date de début invalide. Format attendu: ISO 8601 (ex: 2024-01-01T00:00:00.000Z)"
}
```

### Date de fin antérieure à la date de début (400)

**Requête :** `/api/admin/mailboxes/{id}/stats?startDate=2024-12-31T00:00:00.000Z&endDate=2024-01-01T00:00:00.000Z`

**Réponse :**
```json
{
  "error": "La date de début doit être antérieure à la date de fin"
}
```

### Erreur Microsoft Graph (500)

**Requête :** `/api/admin/mailboxes/{id}/stats`

**Réponse :**
```json
{
  "error": "Erreur lors de la récupération des statistiques",
  "details": "Impossible de créer le client Graph"
}
```


## Performance

- **Mode rapide** : ~300-500ms (sans messages sans réponse)
- **Mode standard** : ~1-3s (avec messages sans réponse)
- **Mode complet** : ~2-5s (avec échantillon et dossiers)

## Limitations

- Maximum 20 messages dans l'échantillon des messages sans réponse
- Les propriétés PidTagMessageStatus peuvent ne pas être disponibles sur tous les environnements Microsoft Graph
- Une méthode alternative basée sur conversationId est utilisée en fallback

## Types TypeScript

```typescript
interface MailboxPeriodStats {
  emailAddress: string;
  mailboxId?: string;
  mailboxName?: string;
  totalMessages: number;
  unreadMessages: number;
  readMessages: number;
  unansweredMessages: number;
  answeredMessages: number;
  period: {
    startDate: string | null;
    endDate: string | null;
    description: string;
  };
  folders?: FolderStats[];
  sampleUnanswered?: UnansweredMessage[];
  generatedAt?: string;
  parameters?: StatsQueryParams;
  summary?: {
    periodDays: number | null;
    responseRate: number;
    readRate: number;
  };
}
```
