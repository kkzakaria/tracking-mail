'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
  Mail,
  BarChart3,
  Eye,
  Webhook,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw
} from 'lucide-react';

// Import des composants de tracking (à créer)
import { EmailSenderForm } from '@/components/tracking/email-sender-form';
import { AnalyticsPanel } from '@/components/tracking/analytics-panel';
import { PixelTester } from '@/components/tracking/pixel-tester';
import { WebhookEvents } from '@/components/tracking/webhook-events';
import { TrackingStatsCard } from '@/components/tracking/tracking-stats-card';

interface EndpointStatus {
  name: string;
  url: string;
  status: 'online' | 'offline' | 'checking';
  responseTime?: number;
  lastChecked?: Date;
}

export default function TrackingPage() {
  const [endpoints, setEndpoints] = useState<EndpointStatus[]>([
    {
      name: 'Send Tracked Email',
      url: '/api/mail/send-tracked',
      status: 'checking'
    },
    {
      name: 'Tracking Analytics',
      url: '/api/mail/tracking/analytics',
      status: 'checking'
    },
    {
      name: 'Pixel Tracking',
      url: '/api/tracking/pixel/test',
      status: 'checking'
    },
    {
      name: 'Webhook Notifications',
      url: '/api/webhooks/graph-notifications',
      status: 'checking'
    }
  ]);

  const [refreshing, setRefreshing] = useState(false);

  // Fonction pour vérifier le statut des endpoints
  const checkEndpointStatus = async (endpoint: EndpointStatus): Promise<EndpointStatus> => {
    try {
      const startTime = Date.now();
      const response = await fetch(endpoint.url, {
        method: endpoint.url.includes('send-tracked') ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        body: endpoint.url.includes('send-tracked') ? JSON.stringify({}) : undefined
      });

      const responseTime = Date.now() - startTime;

      // Pour les endpoints qui retournent 401 (auth required), c'est considéré comme "online"
      const isOnline = response.status === 200 ||
                      response.status === 401 ||
                      (endpoint.url.includes('pixel') && response.status === 200);

      return {
        ...endpoint,
        status: isOnline ? 'online' : 'offline',
        responseTime,
        lastChecked: new Date()
      };
    } catch (error) {
      return {
        ...endpoint,
        status: 'offline',
        lastChecked: new Date()
      };
    }
  };

  // Vérifier tous les endpoints
  const checkAllEndpoints = async () => {
    setRefreshing(true);
    try {
      const updatedEndpoints = await Promise.all(
        endpoints.map(endpoint => checkEndpointStatus(endpoint))
      );
      setEndpoints(updatedEndpoints);
    } catch (error) {
      console.error('Error checking endpoints:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Vérifier les endpoints au chargement
  useEffect(() => {
    checkAllEndpoints();
  }, []);

  // Fonction pour obtenir le badge de statut
  const getStatusBadge = (status: EndpointStatus['status']) => {
    switch (status) {
      case 'online':
        return <Badge variant="secondary" className="text-green-700 bg-green-100"><CheckCircle2 className="w-3 h-3 mr-1" />En ligne</Badge>;
      case 'offline':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Hors ligne</Badge>;
      case 'checking':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Vérification...</Badge>;
      default:
        return <Badge variant="outline">Inconnu</Badge>;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* En-tête */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Email Tracking Dashboard</h1>
            <p className="text-muted-foreground mt-2">
              Interface de test et monitoring pour le système de tracking d'emails
            </p>
          </div>
          <Button
            onClick={checkAllEndpoints}
            disabled={refreshing}
            variant="outline"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>

        {/* Statut des endpoints */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Statut des Endpoints</CardTitle>
            <CardDescription>
              État en temps réel des services de tracking
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {endpoints.map((endpoint, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{endpoint.name}</p>
                    <p className="text-xs text-muted-foreground">{endpoint.url}</p>
                    {endpoint.responseTime && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {endpoint.responseTime}ms
                      </p>
                    )}
                  </div>
                  <div className="ml-2">
                    {getStatusBadge(endpoint.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statistiques rapides */}
      <div className="mb-8">
        <TrackingStatsCard />
      </div>

      <Separator className="mb-8" />

      {/* Interface principale avec tabs */}
      <Tabs defaultValue="send" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="send" className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Envoi d'Email
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="pixel" className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Pixel Tracking
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="flex items-center gap-2">
            <Webhook className="w-4 h-4" />
            Webhooks
          </TabsTrigger>
        </TabsList>

        {/* Tab Content - Envoi d'Email */}
        <TabsContent value="send" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Test d'Envoi d'Email avec Tracking</CardTitle>
              <CardDescription>
                Envoyez un email de test avec tracking activé pour valider le fonctionnement du système
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmailSenderForm />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Content - Analytics */}
        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Analytics de Tracking</CardTitle>
              <CardDescription>
                Consultez les métriques et statistiques de vos emails trackés
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnalyticsPanel />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Content - Pixel Tracking */}
        <TabsContent value="pixel" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Test du Pixel de Tracking</CardTitle>
              <CardDescription>
                Testez le fonctionnement du pixel de tracking pour la détection d'ouverture
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PixelTester />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Content - Webhooks */}
        <TabsContent value="webhooks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Événements Webhook</CardTitle>
              <CardDescription>
                Monitorer les événements webhook en temps réel et tester les notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WebhookEvents />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}