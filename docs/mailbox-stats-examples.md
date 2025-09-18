# Exemples de Code - API Statistiques

## JavaScript/Node.js
```javascript
// JavaScript/Node.js avec fetch
async function getMailboxStats(mailboxId, options = {}) {
  const params = new URLSearchParams(options);
  const url = `/api/admin/mailboxes/${mailboxId}/stats?${params}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${yourAdminToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

// Utilisation
const stats = await getMailboxStats('dcc8512f-1411-45d0-a161-721c2eacb5bd', {
  startDate: '2024-01-01T00:00:00.000Z',
  endDate: '2024-12-31T23:59:59.999Z',
  includeUnanswered: true
});

console.log(`Total: ${stats.totalMessages}, Sans réponse: ${stats.unansweredMessages}`);

```

## Python
```python
# Python avec requests
import requests
from datetime import datetime

def get_mailbox_stats(mailbox_id, **options):
    url = f"/api/admin/mailboxes/{mailbox_id}/stats"
    headers = {
        'Authorization': f'Bearer {your_admin_token}',
        'Content-Type': 'application/json'
    }

    response = requests.get(url, headers=headers, params=options)
    response.raise_for_status()

    return response.json()

# Utilisation
stats = get_mailbox_stats(
    'dcc8512f-1411-45d0-a161-721c2eacb5bd',
    startDate='2024-01-01T00:00:00.000Z',
    endDate='2024-12-31T23:59:59.999Z',
    includeUnanswered=True
)

print(f"Total: {stats['totalMessages']}, Sans réponse: {stats['unansweredMessages']}")

```

## cURL/Bash
```bash
# Bash/cURL
MAILBOX_ID="dcc8512f-1411-45d0-a161-721c2eacb5bd"
ADMIN_TOKEN="your-admin-token"

# Mode rapide
curl -X GET \
  "http://localhost:3000/api/admin/mailboxes/${MAILBOX_ID}/stats?quick=true" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json"

# Avec période spécifique
curl -X GET \
  "http://localhost:3000/api/admin/mailboxes/${MAILBOX_ID}/stats?startDate=2024-01-01T00:00:00.000Z&endDate=2024-12-31T23:59:59.999Z&includeUnanswered=true" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json"

```
