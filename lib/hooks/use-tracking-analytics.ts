'use client';

import { useState, useEffect, useCallback } from 'react';
import { trackingApiClient, type AnalyticsRequest, type AnalyticsResponse } from '@/lib/api/tracking-client';

interface UseTrackingAnalyticsOptions {
  autoFetch?: boolean;
  refreshInterval?: number; // en millisecondes
}

interface UseTrackingAnalyticsReturn {
  data: AnalyticsResponse['data'] | null;
  loading: boolean;
  error: string | null;
  fetchAnalytics: (request?: AnalyticsRequest) => Promise<void>;
  refetch: () => Promise<void>;
  lastFetch: Date | null;
}

export function useTrackingAnalytics(
  initialRequest: AnalyticsRequest = { period: 'month' },
  options: UseTrackingAnalyticsOptions = {}
): UseTrackingAnalyticsReturn {
  const { autoFetch = true, refreshInterval } = options;

  const [data, setData] = useState<AnalyticsResponse['data'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [currentRequest, setCurrentRequest] = useState<AnalyticsRequest>(initialRequest);

  // Fonction pour récupérer les analytics
  const fetchAnalytics = useCallback(async (request?: AnalyticsRequest) => {
    const requestToUse = request || currentRequest;
    setCurrentRequest(requestToUse);
    setLoading(true);
    setError(null);

    try {
      const response = await trackingApiClient.getAnalytics(requestToUse);

      if (response.success && response.data) {
        setData(response.data);
        setLastFetch(new Date());
      } else {
        setError(response.error?.message || 'Erreur lors de la récupération des analytics');
        setData(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMessage);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [currentRequest]);

  // Fonction pour re-fetch avec les mêmes paramètres
  const refetch = useCallback(() => fetchAnalytics(), [fetchAnalytics]);

  // Auto-fetch au montage si activé
  useEffect(() => {
    if (autoFetch) {
      fetchAnalytics();
    }
  }, [autoFetch, fetchAnalytics]);

  // Refresh interval si spécifié
  useEffect(() => {
    if (refreshInterval && refreshInterval > 0) {
      const interval = setInterval(() => {
        if (!loading) {
          refetch();
        }
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [refreshInterval, loading, refetch]);

  return {
    data,
    loading,
    error,
    fetchAnalytics,
    refetch,
    lastFetch
  };
}