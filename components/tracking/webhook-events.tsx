'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Webhook,
  Send,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertCircle,
  Clock,
  Mail,
  Eye,
  MousePointer,
  Reply
} from 'lucide-react';

interface WebhookEvent {
  id: string;
  type: 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced';
  trackingId: string;
  timestamp: Date;
  data?: Record<string, any>;
  userAgent?: string;
  ipAddress?: string;
}

interface WebhookTestPayload {
  value: Array<{
    resourceData: {
      '@odata.type': string;
      '@odata.id': string;
      id: string;
    };
    resource: string;
    changeType: string;
  }>;
}

export function WebhookEvents() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [testPayload, setTestPayload] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Événements simulés pour la démonstration
  const mockEvents: WebhookEvent[] = [
    {
      id: '1',
      type: 'sent',
      trackingId: 'track_abc123',
      timestamp: new Date(Date.now() - 300000),
      data: { messageId: 'msg_123' }
    },
    {
      id: '2',
      type: 'delivered',
      trackingId: 'track_abc123',
      timestamp: new Date(Date.now() - 240000),
      data: { messageId: 'msg_123' }
    },
    {
      id: '3',
      type: 'opened',
      trackingId: 'track_abc123',
      timestamp: new Date(Date.now() - 120000),
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
      ipAddress: '192.168.1.100'
    }
  ];

  // Payload de test par défaut
  const defaultTestPayload = {
    value: [{
      resourceData: {
        '@odata.type': '#Microsoft.Graph.Message',
        '@odata.id': 'Users(\'test@example.com\')/Messages(\'test123\')',
        id: 'test123'
      },
      resource: 'Users/test@example.com/Messages',
      changeType: 'created'
    }]
  };

  // Initialiser avec des événements mock et le payload de test
  useEffect(() => {
    setEvents(mockEvents);
    setTestPayload(JSON.stringify(defaultTestPayload, null, 2));
  }, []);

  // Fonction pour obtenir l'icône du type d'événement
  const getEventIcon = (type: WebhookEvent['type']) => {
    switch (type) {
      case 'sent':
        return <Mail className="w-4 h-4" />;
      case 'delivered':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'opened':
        return <Eye className="w-4 h-4" />;
      case 'clicked':
        return <MousePointer className="w-4 h-4" />;
      case 'replied':
        return <Reply className="w-4 h-4" />;
      case 'bounced':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Webhook className="w-4 h-4" />;
    }
  };

  // Fonction pour obtenir le badge du type d'événement
  const getEventBadge = (type: WebhookEvent['type']) => {
    const variants = {
      sent: 'secondary',
      delivered: 'default',
      opened: 'secondary',
      clicked: 'default',
      replied: 'default',
      bounced: 'destructive'
    } as const;

    return (
      <Badge variant={variants[type]} className="flex items-center gap-1">
        {getEventIcon(type)}
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    );
  };

  // Formater le timestamp
  const formatTimestamp = (timestamp: Date): string => {
    return timestamp.toLocaleString('fr-FR');
  };

  // Calculer le temps relatif
  const getRelativeTime = (timestamp: Date): string => {
    const diff = Date.now() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'À l\'instant';
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours}h`;
    return `Il y a ${Math.floor(hours / 24)}j`;
  };

  // Simuler l'écoute en temps réel
  const toggleListening = () => {
    setIsListening(!isListening);

    if (!isListening) {
      // Simuler de nouveaux événements toutes les 10 secondes
      const interval = setInterval(() => {
        const newEvent: WebhookEvent = {
          id: Date.now().toString(),
          type: ['opened', 'clicked', 'replied'][Math.floor(Math.random() * 3)] as any,
          trackingId: 'track_live_' + Math.random().toString(36).substring(2, 7),
          timestamp: new Date(),
          userAgent: 'Test-User-Agent/1.0',
          ipAddress: '127.0.0.1'
        };

        setEvents(prev => [newEvent, ...prev].slice(0, 20)); // Garder les 20 derniers
      }, 10000);

      // Nettoyer l'interval quand on arrête l'écoute
      return () => clearInterval(interval);
    }
  };

  // Tester l'endpoint webhook
  const testWebhookEndpoint = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      let payload;
      try {
        payload = JSON.parse(testPayload);
      } catch (error) {
        throw new Error('JSON invalide dans le payload de test');
      }

      const response = await fetch('/api/webhooks/graph-notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setTestResult({
          success: true,
          message: `Webhook testé avec succès (${response.status})`
        });

        // Ajouter un événement simulé
        const newEvent: WebhookEvent = {
          id: Date.now().toString(),
          type: 'replied',
          trackingId: 'track_webhook_test',
          timestamp: new Date(),
          data: { source: 'webhook_test' }
        };
        setEvents(prev => [newEvent, ...prev]);
      } else {
        setTestResult({
          success: false,
          message: `Erreur ${response.status}: ${response.statusText}`
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Erreur inconnue'
      });
    } finally {
      setTesting(false);
    }
  };

  // Effacer les événements
  const clearEvents = () => {
    setEvents([]);
  };

  return (
    <div className="space-y-6">
      {/* Contrôles */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-2">
          <Button
            onClick={toggleListening}
            variant={isListening ? "destructive" : "default"}
          >
            <Webhook className={`w-4 h-4 mr-2 ${isListening ? 'animate-pulse' : ''}`} />
            {isListening ? 'Arrêter l\'écoute' : 'Écouter les événements'}
          </Button>

          <Button onClick={clearEvents} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Effacer
          </Button>
        </div>

        {/* Dialog pour tester l'endpoint */}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Tester Webhook
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Test de l'Endpoint Webhook</DialogTitle>
              <DialogDescription>
                Envoyez un payload de test à l'endpoint webhook pour valider son fonctionnement.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="test-payload">Payload JSON</Label>
                <Textarea
                  id="test-payload"
                  value={testPayload}
                  onChange={(e) => setTestPayload(e.target.value)}
                  className="font-mono text-sm min-h-[200px]"
                  placeholder="Payload JSON pour le test"
                />
              </div>

              <Button onClick={testWebhookEndpoint} disabled={testing}>
                <Send className={`w-4 h-4 mr-2 ${testing ? 'animate-pulse' : ''}`} />
                {testing ? 'Test en cours...' : 'Envoyer le Test'}
              </Button>

              {testResult && (
                <Alert className={testResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                  <AlertDescription className={testResult.success ? 'text-green-800' : 'text-red-800'}>
                    {testResult.message}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statut d'écoute */}
      {isListening && (
        <Alert className="border-blue-200 bg-blue-50">
          <Webhook className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            🔴 En écoute - Les événements webhook apparaîtront en temps réel ci-dessous
          </AlertDescription>
        </Alert>
      )}

      {/* Liste des événements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Événements Webhook Récents</span>
            <Badge variant="outline">
              {events.length} événement{events.length !== 1 ? 's' : ''}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Tracking ID</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Temps relatif</TableHead>
                  <TableHead>Détails</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      {getEventBadge(event.type)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {event.trackingId}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatTimestamp(event.timestamp)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        <Clock className="w-3 h-3 mr-1" />
                        {getRelativeTime(event.timestamp)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {event.userAgent && (
                        <div>UA: {event.userAgent.substring(0, 30)}...</div>
                      )}
                      {event.ipAddress && (
                        <div>IP: {event.ipAddress}</div>
                      )}
                      {event.data && (
                        <div>Data: {JSON.stringify(event.data)}</div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <Webhook className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Aucun événement</h3>
              <p className="text-muted-foreground">
                Les événements webhook apparaîtront ici en temps réel
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informations sur les webhooks */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration des Webhooks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="space-y-2">
            <p>
              <strong>Endpoint :</strong> <code className="text-xs bg-muted px-1 py-0.5 rounded">/api/webhooks/graph-notifications</code>
            </p>
            <p>
              <strong>Méthode :</strong> POST avec payload JSON Microsoft Graph
            </p>
            <p>
              <strong>Événements supportés :</strong> Création de messages, réponses, suppressions
            </p>
            <p>
              <strong>Authentification :</strong> Headers Microsoft Graph (validationToken pour subscription)
            </p>
          </div>

          <div className="mt-4 p-3 border rounded-lg bg-yellow-50 border-yellow-200">
            <p className="text-yellow-800">
              <strong>⚠️ Note :</strong> Les webhooks en temps réel nécessitent une configuration Microsoft Graph
              avec des URLs accessibles publiquement. En développement, utilisez ngrok ou similaire.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}