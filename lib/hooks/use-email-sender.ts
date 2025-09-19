'use client';

import { useState, useCallback } from 'react';
import { trackingApiClient, type SendTrackedEmailRequest, type SendTrackedEmailResponse } from '@/lib/api/tracking-client';

interface UseEmailSenderReturn {
  sendEmail: (request: SendTrackedEmailRequest) => Promise<SendTrackedEmailResponse>;
  loading: boolean;
  lastResult: SendTrackedEmailResponse | null;
  error: string | null;
  isSuccess: boolean;
  trackingId: string | null;
  messageId: string | null;
  reset: () => void;
}

export function useEmailSender(): UseEmailSenderReturn {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<SendTrackedEmailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fonction pour envoyer un email
  const sendEmail = useCallback(async (request: SendTrackedEmailRequest): Promise<SendTrackedEmailResponse> => {
    setLoading(true);
    setError(null);

    try {
      const response = await trackingApiClient.sendTrackedEmail(request);
      setLastResult(response);

      if (!response.success) {
        setError(response.error?.message || 'Erreur lors de l\'envoi');
      }

      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMessage);

      const errorResponse: SendTrackedEmailResponse = {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: errorMessage
        }
      };

      setLastResult(errorResponse);
      return errorResponse;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fonction pour réinitialiser l'état
  const reset = useCallback(() => {
    setLastResult(null);
    setError(null);
  }, []);

  // Computed values
  const isSuccess = lastResult?.success ?? false;
  const trackingId = lastResult?.data?.trackingId ?? null;
  const messageId = lastResult?.data?.messageId ?? null;

  return {
    sendEmail,
    loading,
    lastResult,
    error,
    isSuccess,
    trackingId,
    messageId,
    reset
  };
}