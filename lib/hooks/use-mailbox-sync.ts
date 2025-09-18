'use client';

import { useState, useCallback } from 'react';

interface SyncResult {
  success: boolean;
  data?: {
    messageCount: number;
    recentMessages: any[];
    syncedAt: string;
    emailAddress: string;
  };
  error?: string;
}

interface EmailWithoutReplyResult {
  success: boolean;
  data?: {
    emailsWithoutReply: any[];
    totalAnalyzed: number;
    mailbox: {
      id: string;
      emailAddress: string;
      displayName: string;
    };
    criteria: {
      daysWithoutReply: number;
      analyzedPeriod: string;
      cutoffDate: string;
    };
  };
  message?: string;
  error?: string;
}

export function useMailboxSync() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncMailbox = useCallback(async (mailboxId: string): Promise<SyncResult> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/mailboxes/${mailboxId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Erreur lors de la synchronisation');
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const getEmailsWithoutReply = useCallback(async (
    mailboxId: string,
    options: { days?: number; limit?: number } = {}
  ): Promise<EmailWithoutReplyResult> => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.days) params.append('days', options.days.toString());
      if (options.limit) params.append('limit', options.limit.toString());

      const response = await fetch(
        `/api/admin/mailboxes/${mailboxId}/sent-without-reply?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Erreur lors de la récupération des emails sans réponse');
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const sendFollowUp = useCallback(async (
    mailboxId: string,
    followUpData: {
      originalMessageId: string;
      originalSubject: string;
      recipientEmail: string;
      daysSince: number;
      customMessage?: string;
      importance?: string;
    }
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/mailboxes/${mailboxId}/send-followup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(followUpData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Erreur lors de l\'envoi de la relance');
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const getMailboxMessages = useCallback(async (
    mailboxId: string,
    options: { limit?: number; unreadOnly?: boolean; page?: number } = {}
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.unreadOnly) params.append('unreadOnly', 'true');
      if (options.page) params.append('page', options.page.toString());

      const response = await fetch(
        `/api/user/mailbox/${mailboxId}/messages?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Erreur lors de la récupération des messages');
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    syncMailbox,
    getEmailsWithoutReply,
    sendFollowUp,
    getMailboxMessages,
  };
}