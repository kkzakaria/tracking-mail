'use client';

import { useState, useCallback } from 'react';
import { trackingApiClient } from '@/lib/api/tracking-client';

interface PixelTestResult {
  success: boolean;
  trackingId: string;
  responseTime?: number;
  contentType?: string;
  pixelSize?: { width: number; height: number };
  error?: string;
  timestamp: Date;
}

interface WebhookTestResult {
  success: boolean;
  status?: number;
  message?: string;
  error?: string;
  timestamp: Date;
}

interface EndpointStatus {
  name: string;
  url: string;
  status: 'online' | 'offline' | 'checking';
  responseTime?: number;
  lastChecked?: Date;
  error?: string;
}

interface UseTrackingTestReturn {
  // Pixel testing
  pixelTestResult: PixelTestResult | null;
  pixelTesting: boolean;
  testPixel: (trackingId: string) => Promise<PixelTestResult>;
  resetPixelTest: () => void;

  // Webhook testing
  webhookTestResult: WebhookTestResult | null;
  webhookTesting: boolean;
  testWebhookEndpoint: (payload: any) => Promise<WebhookTestResult>;
  resetWebhookTest: () => void;

  // Endpoint status
  endpointStatuses: EndpointStatus[];
  checkingEndpoints: boolean;
  checkEndpointStatus: (endpoint?: string) => Promise<void>;
  checkAllEndpoints: () => Promise<void>;

  // Utilities
  generateTestTrackingId: () => string;
  getPixelUrl: (trackingId: string) => string;
  generatePixelHTML: (trackingId: string) => string;
}

const DEFAULT_ENDPOINTS = [
  {
    name: 'Send Email',
    url: '/api/mail/send-tracked'
  },
  {
    name: 'Tracking Status',
    url: '/api/mail/tracking/[id]'
  },
  {
    name: 'Analytics',
    url: '/api/mail/tracking/analytics'
  },
  {
    name: 'Pixel Tracking',
    url: '/api/tracking/pixel/[id]'
  },
  {
    name: 'Webhook Notifications',
    url: '/api/webhooks/graph-notifications'
  }
];

export function useTrackingTest(): UseTrackingTestReturn {
  const [pixelTestResult, setPixelTestResult] = useState<PixelTestResult | null>(null);
  const [pixelTesting, setPixelTesting] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<WebhookTestResult | null>(null);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [endpointStatuses, setEndpointStatuses] = useState<EndpointStatus[]>(
    DEFAULT_ENDPOINTS.map(endpoint => ({
      ...endpoint,
      status: 'offline' as const
    }))
  );
  const [checkingEndpoints, setCheckingEndpoints] = useState(false);

  // Générer un tracking ID de test
  const generateTestTrackingId = useCallback((): string => {
    return 'track_test_' + Math.random().toString(36).substring(2, 15);
  }, []);

  // Obtenir l'URL complète du pixel
  const getPixelUrl = useCallback((trackingId: string): string => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/api/tracking/pixel/${trackingId}`;
  }, []);

  // Générer le code HTML du pixel
  const generatePixelHTML = useCallback((trackingId: string): string => {
    return `<img src="${getPixelUrl(trackingId)}" width="1" height="1" style="display:none;" alt="" />`;
  }, [getPixelUrl]);

  // Tester le pixel de tracking
  const testPixel = useCallback(async (trackingId: string): Promise<PixelTestResult> => {
    if (!trackingId.trim()) {
      const result: PixelTestResult = {
        success: false,
        trackingId: '',
        error: 'Veuillez saisir un tracking ID',
        timestamp: new Date()
      };
      setPixelTestResult(result);
      return result;
    }

    setPixelTesting(true);
    setPixelTestResult(null);

    try {
      const testResult = await trackingApiClient.testPixel(trackingId);

      const result: PixelTestResult = {
        success: testResult.success,
        trackingId,
        responseTime: testResult.responseTime,
        contentType: testResult.contentType,
        pixelSize: testResult.success ? { width: 1, height: 1 } : undefined,
        error: testResult.error,
        timestamp: new Date()
      };

      setPixelTestResult(result);
      return result;
    } catch (error) {
      const result: PixelTestResult = {
        success: false,
        trackingId,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        timestamp: new Date()
      };

      setPixelTestResult(result);
      return result;
    } finally {
      setPixelTesting(false);
    }
  }, []);

  // Tester l'endpoint webhook
  const testWebhookEndpoint = useCallback(async (payload: any): Promise<WebhookTestResult> => {
    setWebhookTesting(true);
    setWebhookTestResult(null);

    try {
      const testResult = await trackingApiClient.testWebhook(payload);

      const result: WebhookTestResult = {
        success: testResult.success,
        status: testResult.status,
        message: testResult.message,
        error: testResult.error,
        timestamp: new Date()
      };

      setWebhookTestResult(result);
      return result;
    } catch (error) {
      const result: WebhookTestResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        timestamp: new Date()
      };

      setWebhookTestResult(result);
      return result;
    } finally {
      setWebhookTesting(false);
    }
  }, []);

  // Vérifier le statut d'un endpoint spécifique
  const checkEndpointStatus = useCallback(async (endpointName?: string) => {
    setCheckingEndpoints(true);

    const endpointsToCheck = endpointName
      ? endpointStatuses.filter(e => e.name === endpointName)
      : endpointStatuses;

    for (const endpoint of endpointsToCheck) {
      setEndpointStatuses(prev => prev.map(e =>
        e.name === endpoint.name
          ? { ...e, status: 'checking' as const }
          : e
      ));

      try {
        const startTime = Date.now();
        let testUrl = endpoint.url;

        // Remplacer les paramètres de route pour les tests
        if (testUrl.includes('[id]')) {
          testUrl = testUrl.replace('[id]', 'test123');
        }

        const response = await fetch(testUrl, {
          method: endpoint.name === 'Send Email' ? 'POST' : 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          body: endpoint.name === 'Send Email' ? JSON.stringify({
            to: 'test@example.com',
            subject: 'Test',
            body: 'Test message',
            bodyType: 'text',
            enableTracking: true
          }) : undefined
        });

        const responseTime = Date.now() - startTime;

        setEndpointStatuses(prev => prev.map(e =>
          e.name === endpoint.name
            ? {
                ...e,
                status: response.ok ? 'online' as const : 'offline' as const,
                responseTime,
                lastChecked: new Date(),
                error: response.ok ? undefined : `HTTP ${response.status}`
              }
            : e
        ));
      } catch (error) {
        setEndpointStatuses(prev => prev.map(e =>
          e.name === endpoint.name
            ? {
                ...e,
                status: 'offline' as const,
                lastChecked: new Date(),
                error: error instanceof Error ? error.message : 'Erreur réseau'
              }
            : e
        ));
      }
    }

    setCheckingEndpoints(false);
  }, [endpointStatuses]);

  // Vérifier tous les endpoints
  const checkAllEndpoints = useCallback(async () => {
    await checkEndpointStatus();
  }, [checkEndpointStatus]);

  // Réinitialiser le test pixel
  const resetPixelTest = useCallback(() => {
    setPixelTestResult(null);
  }, []);

  // Réinitialiser le test webhook
  const resetWebhookTest = useCallback(() => {
    setWebhookTestResult(null);
  }, []);

  return {
    // Pixel testing
    pixelTestResult,
    pixelTesting,
    testPixel,
    resetPixelTest,

    // Webhook testing
    webhookTestResult,
    webhookTesting,
    testWebhookEndpoint,
    resetWebhookTest,

    // Endpoint status
    endpointStatuses,
    checkingEndpoints,
    checkEndpointStatus,
    checkAllEndpoints,

    // Utilities
    generateTestTrackingId,
    getPixelUrl,
    generatePixelHTML
  };
}