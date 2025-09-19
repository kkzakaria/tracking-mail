'use client';

import { useState, useEffect, useCallback } from 'react';
import { trackingApiClient } from '@/lib/api/tracking-client';

export interface WebhookEvent {
  id: string;
  type: 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced';
  trackingId: string;
  timestamp: Date;
  data?: Record<string, any>;
  userAgent?: string;
  ipAddress?: string;
}

interface UseWebhookEventsOptions {
  maxEvents?: number;
  autoStart?: boolean;
  simulationInterval?: number; // en millisecondes
}

interface UseWebhookEventsReturn {
  events: WebhookEvent[];
  isListening: boolean;
  lastEvent: WebhookEvent | null;
  eventCount: number;
  addEvent: (event: Omit<WebhookEvent, 'id' | 'timestamp'>) => void;
  clearEvents: () => void;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  testWebhook: (payload: any) => Promise<{ success: boolean; message: string }>;
}

export function useWebhookEvents(
  options: UseWebhookEventsOptions = {}
): UseWebhookEventsReturn {
  const {
    maxEvents = 50,
    autoStart = false,
    simulationInterval = 10000
  } = options;

  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [isListening, setIsListening] = useState(false);

  // Ajouter un nouvel événement
  const addEvent = useCallback((eventData: Omit<WebhookEvent, 'id' | 'timestamp'>) => {
    const newEvent: WebhookEvent = {
      ...eventData,
      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      timestamp: new Date()
    };

    setEvents(prev => [newEvent, ...prev].slice(0, maxEvents));
  }, [maxEvents]);

  // Effacer tous les événements
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // Démarrer l'écoute
  const startListening = useCallback(() => {
    setIsListening(true);
  }, []);

  // Arrêter l'écoute
  const stopListening = useCallback(() => {
    setIsListening(false);
  }, []);

  // Basculer l'état d'écoute
  const toggleListening = useCallback(() => {
    setIsListening(prev => !prev);
  }, []);

  // Tester l'endpoint webhook
  const testWebhook = useCallback(async (payload: any): Promise<{ success: boolean; message: string }> => {
    try {
      const result = await trackingApiClient.testWebhook(payload);

      if (result.success) {
        // Ajouter un événement de test
        addEvent({
          type: 'replied',
          trackingId: 'track_webhook_test',
          data: {
            source: 'webhook_test',
            status: result.status,
            message: result.message
          }
        });

        return {
          success: true,
          message: result.message || `Webhook testé avec succès (${result.status})`
        };
      } else {
        return {
          success: false,
          message: result.error || 'Erreur lors du test du webhook'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erreur inconnue'
      };
    }
  }, [addEvent]);

  // Simulation d'événements en temps réel
  useEffect(() => {
    if (!isListening) return;

    const interval = setInterval(() => {
      const eventTypes: WebhookEvent['type'][] = ['opened', 'clicked', 'replied', 'bounced'];
      const randomType = eventTypes[Math.floor(Math.random() * eventTypes.length)];

      addEvent({
        type: randomType,
        trackingId: 'track_sim_' + Math.random().toString(36).substring(2, 7),
        userAgent: 'Simulated-User-Agent/1.0',
        ipAddress: '192.168.1.' + Math.floor(Math.random() * 255),
        data: {
          simulation: true,
          source: 'real_time_listener'
        }
      });
    }, simulationInterval);

    return () => clearInterval(interval);
  }, [isListening, simulationInterval, addEvent]);

  // Auto-start si spécifié
  useEffect(() => {
    if (autoStart) {
      startListening();
    }
  }, [autoStart, startListening]);

  // Computed values
  const lastEvent = events.length > 0 ? events[0] : null;
  const eventCount = events.length;

  return {
    events,
    isListening,
    lastEvent,
    eventCount,
    addEvent,
    clearEvents,
    startListening,
    stopListening,
    toggleListening,
    testWebhook
  };
}