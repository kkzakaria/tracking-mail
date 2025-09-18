/**
 * Hook pour récupérer les statistiques des 7 derniers jours des boîtes email
 * Utilise la nouvelle API de statistiques pour calculer les métriques de période
 */

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/utils/supabase/client';
import type { MailboxPeriodStats } from '@/lib/types/microsoft-graph';

export interface SevenDayStats {
  mailboxId: string;
  emailAddress: string;
  displayName?: string;
  stats: {
    totalMessages: number;
    unreadMessages: number;
    readMessages: number;
    unansweredMessages: number;
    answeredMessages: number;
    responseRate: number;
    readRate: number;
  };
  trend: {
    messagesChange: number; // Pourcentage de changement vs 7 jours précédents
    unreadChange: number;
    responseRateChange: number;
  };
  error?: string;
}

export interface SevenDayOverview {
  totalMessages: number;
  totalUnread: number;
  totalUnanswered: number;
  averageResponseRate: number;
  averageReadRate: number;
  activeMailboxes: number;
  period: {
    startDate: string;
    endDate: string;
    description: string;
  };
}

interface UseSevenDayStatsReturn {
  stats: SevenDayStats[];
  overview: SevenDayOverview | null;
  loading: boolean;
  error: string | null;
  refreshStats: () => Promise<void>;
  lastUpdated: Date | null;
}

/**
 * Hook pour gérer les statistiques des 7 derniers jours
 */
export function useSevenDayStats(): UseSevenDayStatsReturn {
  console.log('[useSevenDayStats] Hook initialisé');

  const [stats, setStats] = useState<SevenDayStats[]>([]);
  const [overview, setOverview] = useState<SevenDayOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  /**
   * Calcule les dates pour les 7 derniers jours
   */
  const getDateRange = useCallback(() => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      description: `7 derniers jours`
    };
  }, []);

  /**
   * Calcule les dates pour les 7 jours précédents (pour les comparaisons de tendance)
   */
  const getPreviousDateRange = useCallback(() => {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 7);
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    };
  }, []);

  /**
   * Récupère les statistiques d'une boîte email pour une période donnée
   */
  const fetchMailboxStats = async (
    mailboxId: string,
    startDate: string,
    endDate: string
  ): Promise<MailboxPeriodStats | null> => {
    try {
      console.log('[useSevenDayStats] Récupération stats pour mailbox (MODE RAPIDE):', {
        mailboxId,
        startDate,
        endDate,
        forceQuickMode: true
      });

      const params = new URLSearchParams({
        startDate,
        endDate,
        includeUnanswered: 'false', // Désactivé pour éviter les timeouts de 4+ minutes
        onlyUserFolders: 'true',
        quick: 'true' // FORCE MODE RAPIDE
      });

      const url = `/api/admin/mailboxes/${mailboxId}/stats?${params}`;
      console.log('[useSevenDayStats] URL de requête:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('[useSevenDayStats] Réponse HTTP:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[useSevenDayStats] Erreur réponse:', errorText);

        if (response.status === 401 || response.status === 403) {
          throw new Error('Accès non autorisé aux statistiques administrateur');
        }
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[useSevenDayStats] Données reçues:', data);
      return data;
    } catch (error) {
      console.error(`Erreur lors de la récupération des stats pour ${mailboxId}:`, error);
      return null;
    }
  };

  /**
   * Récupère la liste des boîtes email accessibles à l'utilisateur
   */
  const fetchUserMailboxes = async () => {
    console.log('[useSevenDayStats] Récupération des boîtes email utilisateur...');
    const supabase = createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('[useSevenDayStats] Utilisateur authentifié:', {
      userId: user?.id,
      email: user?.email,
      hasError: !!authError
    });

    if (authError || !user) {
      console.error('[useSevenDayStats] Erreur authentification:', authError);
      throw new Error('Utilisateur non authentifié');
    }

    // Récupérer les boîtes email assignées à l'utilisateur
    const { data: assignments, error: assignmentsError } = await supabase
      .from('user_mailbox_assignments')
      .select(`
        mailboxes (
          id,
          email_address,
          display_name,
          is_active
        ),
        permission_level
      `)
      .eq('user_id', user.id)
      .eq('is_active', true);

    console.log('[useSevenDayStats] Résultat query assignments:', {
      count: assignments?.length || 0,
      hasError: !!assignmentsError,
      error: assignmentsError?.message
    });

    if (assignmentsError) {
      console.error('[useSevenDayStats] Erreur assignments:', assignmentsError);
      throw new Error(`Erreur lors du chargement des boîtes email: ${assignmentsError.message}`);
    }

    const filteredAssignments = assignments?.filter(a => a.mailboxes?.is_active) || [];
    console.log('[useSevenDayStats] Boîtes email trouvées:', {
      total: filteredAssignments.length,
      emails: filteredAssignments.map(a => a.mailboxes?.email_address)
    });

    return filteredAssignments;
  };

  /**
   * Calcule les métriques de tendance en comparant deux périodes
   */
  const calculateTrend = (current: MailboxPeriodStats, previous: MailboxPeriodStats | null) => {
    if (!previous) {
      return {
        messagesChange: 0,
        unreadChange: 0,
        responseRateChange: 0
      };
    }

    const calculatePercentageChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const currentResponseRate = current.totalMessages > 0
      ? (current.answeredMessages / current.totalMessages) * 100
      : 0;
    const previousResponseRate = previous.totalMessages > 0
      ? (previous.answeredMessages / previous.totalMessages) * 100
      : 0;

    return {
      messagesChange: calculatePercentageChange(current.totalMessages, previous.totalMessages),
      unreadChange: calculatePercentageChange(current.unreadMessages, previous.unreadMessages),
      responseRateChange: calculatePercentageChange(currentResponseRate, previousResponseRate)
    };
  };

  /**
   * Rafraîchit toutes les statistiques
   */
  const refreshStats = useCallback(async () => {
    console.log('[useSevenDayStats] refreshStats appelé');
    setLoading(true);
    setError(null);

    try {
      // Récupérer les boîtes email de l'utilisateur
      const mailboxes = await fetchUserMailboxes();

      if (mailboxes.length === 0) {
        setStats([]);
        setOverview(null);
        setLastUpdated(new Date());
        return;
      }

      // Définir les périodes
      const currentPeriod = getDateRange();
      const previousPeriod = getPreviousDateRange();

      // Récupérer les statistiques pour chaque boîte email
      const statsPromises = mailboxes.map(async (assignment) => {
        const mailbox = assignment.mailboxes;
        if (!mailbox) return null;

        try {
          // Statistiques actuelles (7 derniers jours)
          const currentStats = await fetchMailboxStats(
            mailbox.id,
            currentPeriod.startDate,
            currentPeriod.endDate
          );

          // Statistiques précédentes (7 jours d'avant pour comparaison)
          const previousStats = await fetchMailboxStats(
            mailbox.id,
            previousPeriod.startDate,
            previousPeriod.endDate
          );

          if (!currentStats) {
            return {
              mailboxId: mailbox.id,
              emailAddress: mailbox.email_address,
              displayName: mailbox.display_name || undefined,
              stats: {
                totalMessages: 0,
                unreadMessages: 0,
                readMessages: 0,
                unansweredMessages: 0,
                answeredMessages: 0,
                responseRate: 0,
                readRate: 0
              },
              trend: {
                messagesChange: 0,
                unreadChange: 0,
                responseRateChange: 0
              },
              error: 'Impossible de récupérer les statistiques'
            };
          }

          const responseRate = currentStats.totalMessages > 0
            ? Math.round((currentStats.answeredMessages / currentStats.totalMessages) * 100)
            : 0;

          const readRate = currentStats.totalMessages > 0
            ? Math.round((currentStats.readMessages / currentStats.totalMessages) * 100)
            : 0;

          const trend = calculateTrend(currentStats, previousStats);

          return {
            mailboxId: mailbox.id,
            emailAddress: mailbox.email_address,
            displayName: mailbox.display_name || undefined,
            stats: {
              totalMessages: currentStats.totalMessages,
              unreadMessages: currentStats.unreadMessages,
              readMessages: currentStats.readMessages,
              unansweredMessages: currentStats.unansweredMessages,
              answeredMessages: currentStats.answeredMessages,
              responseRate,
              readRate
            },
            trend
          };

        } catch (error) {
          console.error(`Erreur pour la boîte ${mailbox.email_address}:`, error);
          return {
            mailboxId: mailbox.id,
            emailAddress: mailbox.email_address,
            displayName: mailbox.display_name || undefined,
            stats: {
              totalMessages: 0,
              unreadMessages: 0,
              readMessages: 0,
              unansweredMessages: 0,
              answeredMessages: 0,
              responseRate: 0,
              readRate: 0
            },
            trend: {
              messagesChange: 0,
              unreadChange: 0,
              responseRateChange: 0
            },
            error: error instanceof Error ? error.message : 'Erreur inconnue'
          };
        }
      });

      const results = await Promise.all(statsPromises);
      const validStats = results.filter(Boolean) as SevenDayStats[];

      // Calculer les statistiques globales
      const overview: SevenDayOverview = {
        totalMessages: validStats.reduce((sum, stat) => sum + stat.stats.totalMessages, 0),
        totalUnread: validStats.reduce((sum, stat) => sum + stat.stats.unreadMessages, 0),
        totalUnanswered: validStats.reduce((sum, stat) => sum + stat.stats.unansweredMessages, 0),
        averageResponseRate: validStats.length > 0
          ? Math.round(validStats.reduce((sum, stat) => sum + stat.stats.responseRate, 0) / validStats.length)
          : 0,
        averageReadRate: validStats.length > 0
          ? Math.round(validStats.reduce((sum, stat) => sum + stat.stats.readRate, 0) / validStats.length)
          : 0,
        activeMailboxes: validStats.length,
        period: currentPeriod
      };

      setStats(validStats);
      setOverview(overview);
      setLastUpdated(new Date());

    } catch (error) {
      console.error('Erreur lors du chargement des statistiques:', error);
      setError(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [getDateRange, getPreviousDateRange]);

  // Charger les statistiques au montage du composant
  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  return {
    stats,
    overview,
    loading,
    error,
    refreshStats,
    lastUpdated
  };
}