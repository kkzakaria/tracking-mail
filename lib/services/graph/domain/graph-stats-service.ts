/**
 * Service de statistiques Microsoft Graph
 * Responsable du calcul et de l'agrégation des statistiques organisationnelles
 */

import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';
import { GraphClientFactory } from '../core/graph-client-factory';
import { GraphRateLimitService } from '../core/graph-rate-limit-service';
import { GraphUserService } from './graph-user-service';
import { GraphMailboxService, type MailboxStats } from './graph-mailbox-service';
import type { GraphOperationResult } from '@/lib/types/microsoft-graph';

/**
 * Statistiques rapides avec estimations (compatible QuickStatsService)
 */
export interface QuickStats {
  totalMessages: number;
  unreadMessages: number;
  readMessages: number;
  unansweredMessages: number;
  answeredMessages: number;
  folders: any[];
}

/**
 * Options pour les estimations rapides
 */
export interface QuickStatsOptions {
  useEstimates?: boolean;
  emailAddress?: string;
  fallbackToDefaults?: boolean;
}

/**
 * Statistiques organisationnelles complètes
 */
export interface OrganizationStats {
  totalUsers: number;
  activeUsers: number;
  totalMailboxes: number;
  lastSyncInfo: {
    total: number;
    syncing: number;
    errors: number;
  };
  departments: Array<{ name: string; userCount: number; }>;
  recentActivity: {
    newMessages: number;
    syncedMailboxes: number;
    errorCount: number;
  };
}

/**
 * Statistiques d'activité utilisateur
 */
export interface UserActivityStats {
  userId: string;
  userEmail: string;
  displayName: string;
  mailboxStats: MailboxStats;
  lastActivity: Date;
  isActive: boolean;
}

/**
 * Résumé des boîtes email
 */
export interface MailboxSummary {
  totalMailboxes: number;
  activeMailboxes: number;
  totalMessages: number;
  unreadMessages: number;
  averageMessagesPerMailbox: number;
  topMailboxesByMessages: Array<{
    email: string;
    messageCount: number;
    unreadCount: number;
  }>;
  syncStatus: {
    upToDate: number;
    syncing: number;
    errors: number;
    lastSyncTime?: Date;
  };
}

/**
 * Options pour les statistiques de période
 */
export interface StatsTimeframe {
  startDate?: Date;
  endDate?: Date;
  period?: 'today' | 'week' | 'month' | 'quarter' | 'year';
}

/**
 * Rapport de performance
 */
export interface PerformanceReport {
  timeframe: StatsTimeframe;
  messaging: {
    totalMessages: number;
    sentMessages: number;
    receivedMessages: number;
    averagePerDay: number;
  };
  synchronization: {
    successfulSyncs: number;
    failedSyncs: number;
    averageSyncTime: number;
    syncReliability: number;
  };
  userEngagement: {
    activeUsers: number;
    messageReaders: number;
    engagementRate: number;
  };
}

/**
 * Service de statistiques Microsoft Graph
 */
export class GraphStatsService {
  private static instance: GraphStatsService;
  private clientFactory: GraphClientFactory;
  private rateLimitService: GraphRateLimitService;
  private userService: GraphUserService;
  private mailboxService: GraphMailboxService;

  private constructor() {
    this.clientFactory = GraphClientFactory.getInstance();
    this.rateLimitService = GraphRateLimitService.getInstance();
    this.userService = GraphUserService.getInstance();
    this.mailboxService = GraphMailboxService.getInstance();
  }

  /**
   * Obtenir l'instance unique du service
   */
  static getInstance(): GraphStatsService {
    if (!GraphStatsService.instance) {
      GraphStatsService.instance = new GraphStatsService();
    }
    return GraphStatsService.instance;
  }

  /**
   * Obtenir les statistiques de l'organisation
   */
  async getOrganizationStats(): Promise<GraphOperationResult<OrganizationStats>> {
    try {
      // Récupérer les statistiques utilisateurs depuis Graph API
      const userStatsResult = await this.userService.getUserStatistics();

      if (!userStatsResult.success || !userStatsResult.data) {
        return {
          success: false,
          error: userStatsResult.error || {
            code: 'USER_STATS_ERROR',
            message: 'Impossible de récupérer les statistiques utilisateurs'
          }
        };
      }

      const userStats = userStatsResult.data;

      // Récupérer les statistiques des boîtes email depuis Supabase
      const mailboxStats = await this.getMailboxStatsFromDB();

      // Calculer les statistiques d'activité récente
      const recentActivity = await this.getRecentActivityStats();

      const stats: OrganizationStats = {
        totalUsers: userStats.totalUsers,
        activeUsers: userStats.activeUsers,
        totalMailboxes: mailboxStats.totalMailboxes,
        lastSyncInfo: mailboxStats.syncInfo,
        departments: Object.entries(userStats.byDepartment).map(([name, count]) => ({
          name,
          userCount: count
        })),
        recentActivity
      };

      return { success: true, data: stats };

    } catch (error) {
      console.error('Error getting organization stats:', error);
      return this.handleError(error, 'STATS_ERROR', 'Erreur lors de la récupération des statistiques');
    }
  }

  /**
   * Obtenir les statistiques d'activité des utilisateurs
   */
  async getUserActivityStats(
    userEmails?: string[]
  ): Promise<GraphOperationResult<UserActivityStats[]>> {
    try {
      const activityStats: UserActivityStats[] = [];

      // Si aucun email spécifié, récupérer tous les utilisateurs actifs
      let emails = userEmails;
      if (!emails) {
        const usersResult = await this.userService.getAllUsers({ accountEnabled: true });
        if (!usersResult.success || !usersResult.data) {
          return {
            success: false,
            error: usersResult.error || {
              code: 'GET_USERS_ERROR',
              message: 'Impossible de récupérer les utilisateurs'
            }
          };
        }
        emails = usersResult.data.map(u => u.mail).filter(Boolean) as string[];
      }

      // Récupérer les statistiques pour chaque utilisateur
      for (const email of emails) {
        try {
          // Récupérer les informations utilisateur
          const userResult = await this.userService.getUserByEmail(email);
          if (!userResult.success || !userResult.data) {
            continue;
          }

          const user = userResult.data;

          // Récupérer les statistiques de la boîte email
          const mailboxStatsResult = await this.mailboxService.getMailboxQuickStats(email);

          const stats: UserActivityStats = {
            userId: user.id,
            userEmail: email,
            displayName: user.displayName,
            mailboxStats: mailboxStatsResult.success && mailboxStatsResult.data
              ? mailboxStatsResult.data
              : { emailAddress: email, totalMessages: 0, unreadMessages: 0, folders: [] },
            lastActivity: new Date(), // Pourrait être calculé depuis les derniers messages
            isActive: user.accountEnabled ?? true
          };

          activityStats.push(stats);

        } catch (error) {
          console.error(`Error getting activity stats for ${email}:`, error);
        }
      }

      return { success: true, data: activityStats };

    } catch (error) {
      console.error('Error getting user activity stats:', error);
      return this.handleError(error, 'ACTIVITY_STATS_ERROR', 'Erreur lors de la récupération des statistiques d\'activité');
    }
  }

  /**
   * Obtenir le résumé des boîtes email
   */
  async getMailboxSummary(): Promise<GraphOperationResult<MailboxSummary>> {
    try {
      const supabase = await createSupabaseServerClient();

      // Récupérer les statistiques depuis la base de données
      const { data: mailboxes, error } = await supabase
        .from('mailboxes')
        .select('email_address, is_active, sync_status, message_count, last_sync_at, updated_at');

      if (error) {
        throw new Error(`Erreur Supabase: ${error.message}`);
      }

      const activeMailboxes = mailboxes?.filter(m => m.is_active) || [];
      const totalMessages = activeMailboxes.reduce((sum, m) => sum + (m.message_count || 0), 0);

      // Calculer les statistiques de synchronisation
      const syncStatus = {
        upToDate: activeMailboxes.filter(m => m.sync_status === 'completed').length,
        syncing: activeMailboxes.filter(m => m.sync_status === 'syncing').length,
        errors: activeMailboxes.filter(m => m.sync_status === 'error').length,
        lastSyncTime: activeMailboxes
          .map(m => m.last_sync_at)
          .filter(Boolean)
          .sort()
          .reverse()[0] ? new Date(activeMailboxes
          .map(m => m.last_sync_at)
          .filter(Boolean)
          .sort()
          .reverse()[0]!) : undefined
      };

      // Top boîtes email par nombre de messages
      const topMailboxesByMessages = activeMailboxes
        .sort((a, b) => (b.message_count || 0) - (a.message_count || 0))
        .slice(0, 10)
        .map(m => ({
          email: m.email_address,
          messageCount: m.message_count || 0,
          unreadCount: 0 // Pourrait être calculé depuis Graph API si nécessaire
        }));

      const summary: MailboxSummary = {
        totalMailboxes: mailboxes?.length || 0,
        activeMailboxes: activeMailboxes.length,
        totalMessages,
        unreadMessages: 0, // Calcul complexe, pourrait être ajouté
        averageMessagesPerMailbox: activeMailboxes.length > 0
          ? Math.round(totalMessages / activeMailboxes.length)
          : 0,
        topMailboxesByMessages,
        syncStatus
      };

      return { success: true, data: summary };

    } catch (error) {
      console.error('Error getting mailbox summary:', error);
      return this.handleError(error, 'SUMMARY_ERROR', 'Erreur lors de la génération du résumé');
    }
  }

  /**
   * Générer un rapport de performance
   */
  async generatePerformanceReport(
    timeframe: StatsTimeframe = { period: 'month' }
  ): Promise<GraphOperationResult<PerformanceReport>> {
    try {
      // Calculer les dates de début et fin selon la période
      const { startDate, endDate } = this.calculateTimeframeDates(timeframe);

      // Récupérer les statistiques de messagerie
      const messagingStats = await this.getMessagingStatsForPeriod(startDate, endDate);

      // Récupérer les statistiques de synchronisation
      const syncStats = await this.getSyncStatsForPeriod(startDate, endDate);

      // Récupérer les statistiques d'engagement
      const engagementStats = await this.getUserEngagementStats(startDate, endDate);

      const report: PerformanceReport = {
        timeframe: { startDate, endDate, ...timeframe },
        messaging: messagingStats,
        synchronization: syncStats,
        userEngagement: engagementStats
      };

      return { success: true, data: report };

    } catch (error) {
      console.error('Error generating performance report:', error);
      return this.handleError(error, 'REPORT_ERROR', 'Erreur lors de la génération du rapport');
    }
  }

  /**
   * Obtenir des statistiques ultra-rapides avec estimations
   * Compatible avec QuickStatsService pour remplacement progressif
   */
  async getQuickStats(emailAddress: string, options?: QuickStatsOptions): Promise<GraphOperationResult<QuickStats>> {
    try {
      console.log('[GraphStatsService] Mode rapide avec estimations intelligentes pour:', emailAddress);

      // Si demandé explicitement d'utiliser les estimations par défaut
      if (options?.fallbackToDefaults) {
        return this.getDefaultQuickEstimates(emailAddress);
      }

      // Tenter d'obtenir des statistiques réelles via le cache
      if (options?.useEstimates !== true) {
        try {
          const realStatsResult = await this.getQuickStatsFromCache(emailAddress);
          if (realStatsResult.success) {
            return realStatsResult;
          }
        } catch (error) {
          console.warn('[GraphStatsService] Real stats failed, falling back to estimates:', error);
        }
      }

      // Utiliser les estimations intelligentes basées sur les données historiques
      return this.getIntelligentEstimates(emailAddress);

    } catch (error) {
      console.error('[GraphStatsService] Error in getQuickStats:', error);
      return this.handleError(error, 'QUICK_STATS_ERROR', 'Erreur lors de la récupération des statistiques rapides');
    }
  }

  /**
   * Obtenir des estimations par défaut (compatible QuickStatsService original)
   */
  async getDefaultQuickEstimates(emailAddress: string): Promise<GraphOperationResult<QuickStats>> {
    console.log('[GraphStatsService] Utilisation des estimations par défaut pour:', emailAddress);

    // Données estimées ultra rapides identiques au QuickStatsService original
    const estimatedTotalMessages = 7500;
    const estimatedUnreadMessages = 350;
    const estimatedUnansweredMessages = Math.round(estimatedTotalMessages * 0.18); // 18%
    const estimatedAnsweredMessages = estimatedTotalMessages - estimatedUnansweredMessages;
    const estimatedReadMessages = estimatedTotalMessages - estimatedUnreadMessages;

    const stats: QuickStats = {
      totalMessages: estimatedTotalMessages,
      unreadMessages: estimatedUnreadMessages,
      readMessages: estimatedReadMessages,
      unansweredMessages: estimatedUnansweredMessages,
      answeredMessages: estimatedAnsweredMessages,
      folders: []
    };

    console.log('[GraphStatsService] ✅ Estimations par défaut générées:', {
      ...stats,
      executionTime: 'instantané'
    });

    return { success: true, data: stats };
  }

  /**
   * Obtenir des statistiques rapides depuis le cache/DB
   */
  private async getQuickStatsFromCache(emailAddress: string): Promise<GraphOperationResult<QuickStats>> {
    try {
      const supabase = await createSupabaseServerClient();

      // Vérifier si on a des données en cache récentes (< 1 heure)
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const { data: mailboxData, error } = await supabase
        .from('mailboxes')
        .select('message_count, last_sync_at, sync_status')
        .eq('email_address', emailAddress)
        .eq('is_active', true)
        .gte('last_sync_at', oneHourAgo.toISOString())
        .single();

      if (error || !mailboxData) {
        throw new Error('No recent cache data available');
      }

      // Utiliser les données en cache avec des estimations pour les détails
      const totalMessages = mailboxData.message_count || 0;
      const estimatedUnreadMessages = Math.round(totalMessages * 0.05); // 5% estimé
      const estimatedUnansweredMessages = Math.round(totalMessages * 0.15); // 15% estimé
      const estimatedAnsweredMessages = totalMessages - estimatedUnansweredMessages;
      const estimatedReadMessages = totalMessages - estimatedUnreadMessages;

      const stats: QuickStats = {
        totalMessages,
        unreadMessages: estimatedUnreadMessages,
        readMessages: estimatedReadMessages,
        unansweredMessages: estimatedUnansweredMessages,
        answeredMessages: estimatedAnsweredMessages,
        folders: []
      };

      console.log('[GraphStatsService] ✅ Statistiques depuis cache:', {
        ...stats,
        lastSync: mailboxData.last_sync_at,
        executionTime: 'rapide'
      });

      return { success: true, data: stats };

    } catch (error) {
      throw new Error(`Cache access failed: ${error}`);
    }
  }

  /**
   * Obtenir des estimations intelligentes basées sur les patterns historiques
   */
  private async getIntelligentEstimates(emailAddress: string): Promise<GraphOperationResult<QuickStats>> {
    try {
      const supabase = await createSupabaseServerClient();

      // Récupérer l'historique de cette boîte email
      const { data: mailboxData, error } = await supabase
        .from('mailboxes')
        .select('message_count, sync_status')
        .eq('email_address', emailAddress)
        .single();

      let baseMessageCount = 5000; // Valeur par défaut
      let unreadRate = 0.08; // 8%
      let unansweredRate = 0.15; // 15%

      if (!error && mailboxData?.message_count) {
        baseMessageCount = mailboxData.message_count;

        // Ajuster les taux selon la taille de la boîte
        if (baseMessageCount > 10000) {
          unreadRate = 0.03; // Grandes boîtes ont moins de % non lus
          unansweredRate = 0.12;
        } else if (baseMessageCount < 1000) {
          unreadRate = 0.15; // Petites boîtes ont plus de % non lus
          unansweredRate = 0.25;
        }
      } else {
        // Essayer d'estimer selon le domaine
        const domain = emailAddress.split('@')[1];
        if (domain) {
          const domainEstimatesResult = await this.getDomainBasedEstimates(domain);
          if (domainEstimatesResult.success && domainEstimatesResult.data) {
            baseMessageCount = domainEstimatesResult.data.averageMessageCount;
            unreadRate = domainEstimatesResult.data.unreadRate;
            unansweredRate = domainEstimatesResult.data.unansweredRate;
          }
        }
      }

      const totalMessages = baseMessageCount;
      const unreadMessages = Math.round(totalMessages * unreadRate);
      const unansweredMessages = Math.round(totalMessages * unansweredRate);
      const answeredMessages = totalMessages - unansweredMessages;
      const readMessages = totalMessages - unreadMessages;

      const stats: QuickStats = {
        totalMessages,
        unreadMessages,
        readMessages,
        unansweredMessages,
        answeredMessages,
        folders: []
      };

      console.log('[GraphStatsService] ✅ Estimations intelligentes générées:', {
        ...stats,
        baseData: !!mailboxData,
        rates: { unreadRate, unansweredRate },
        executionTime: 'estimation intelligente'
      });

      return { success: true, data: stats };

    } catch (error) {
      console.warn('[GraphStatsService] Intelligent estimates failed, using defaults:', error);
      return this.getDefaultQuickEstimates(emailAddress);
    }
  }

  /**
   * Obtenir des estimations basées sur le domaine
   */
  private async getDomainBasedEstimates(domain: string): Promise<GraphOperationResult<{
    averageMessageCount: number;
    unreadRate: number;
    unansweredRate: number;
  }>> {
    try {
      const supabase = await createSupabaseServerClient();

      // Récupérer les statistiques moyennes pour ce domaine
      const { data: domainStats, error } = await supabase
        .rpc('get_domain_averages', { domain_name: domain });

      if (error || !domainStats || domainStats.length === 0) {
        throw new Error('No domain statistics available');
      }

      const avgData = domainStats[0];

      return {
        success: true,
        data: {
          averageMessageCount: avgData.avg_message_count || 4000,
          unreadRate: avgData.avg_unread_rate || 0.08,
          unansweredRate: avgData.avg_unanswered_rate || 0.15
        }
      };

    } catch (error) {
      // Fallback basé sur des patterns de domaines connus
      const knownDomainPatterns: Record<string, { msgCount: number; unreadRate: number; unansweredRate: number }> = {
        'gmail.com': { msgCount: 8000, unreadRate: 0.12, unansweredRate: 0.18 },
        'outlook.com': { msgCount: 6000, unreadRate: 0.08, unansweredRate: 0.14 },
        'microsoft.com': { msgCount: 12000, unreadRate: 0.05, unansweredRate: 0.10 },
        'company.com': { msgCount: 5000, unreadRate: 0.10, unansweredRate: 0.16 }
      };

      const pattern = knownDomainPatterns[domain.toLowerCase()] || knownDomainPatterns['company.com'];

      return {
        success: true,
        data: {
          averageMessageCount: pattern.msgCount,
          unreadRate: pattern.unreadRate,
          unansweredRate: pattern.unansweredRate
        }
      };
    }
  }

  /**
   * Récupérer les statistiques des boîtes email depuis la base de données
   */
  private async getMailboxStatsFromDB(): Promise<{
    totalMailboxes: number;
    syncInfo: { total: number; syncing: number; errors: number; };
  }> {
    try {
      const supabase = await createSupabaseServerClient();

      const { count: totalMailboxes } = await supabase
        .from('mailboxes')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      const { data: syncStats } = await supabase
        .from('mailboxes')
        .select('sync_status')
        .eq('is_active', true);

      const syncInfo = {
        total: syncStats?.length || 0,
        syncing: syncStats?.filter(s => s.sync_status === 'syncing').length || 0,
        errors: syncStats?.filter(s => s.sync_status === 'error').length || 0
      };

      return {
        totalMailboxes: totalMailboxes || 0,
        syncInfo
      };

    } catch (error) {
      console.error('Error getting mailbox stats from DB:', error);
      return { totalMailboxes: 0, syncInfo: { total: 0, syncing: 0, errors: 0 } };
    }
  }

  /**
   * Récupérer les statistiques d'activité récente
   */
  private async getRecentActivityStats(): Promise<{
    newMessages: number;
    syncedMailboxes: number;
    errorCount: number;
  }> {
    try {
      const supabase = await createSupabaseServerClient();
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const { data: recentSyncs } = await supabase
        .from('mailboxes')
        .select('sync_status, last_sync_at, message_count')
        .eq('is_active', true)
        .gte('updated_at', twentyFourHoursAgo.toISOString());

      return {
        newMessages: 0, // Calcul complexe, nécessiterait un suivi des messages
        syncedMailboxes: recentSyncs?.filter(s => s.sync_status === 'completed').length || 0,
        errorCount: recentSyncs?.filter(s => s.sync_status === 'error').length || 0
      };

    } catch (error) {
      console.error('Error getting recent activity stats:', error);
      return { newMessages: 0, syncedMailboxes: 0, errorCount: 0 };
    }
  }

  /**
   * Calculer les dates de début et fin pour une période
   */
  private calculateTimeframeDates(timeframe: StatsTimeframe): { startDate: Date; endDate: Date } {
    const now = new Date();
    const endDate = timeframe.endDate || now;
    let startDate = timeframe.startDate || now;

    if (timeframe.period) {
      switch (timeframe.period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        case 'quarter':
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
          break;
        case 'year':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
      }
    }

    return { startDate, endDate };
  }

  /**
   * Statistiques de messagerie pour une période (implémentation simplifiée)
   */
  private async getMessagingStatsForPeriod(startDate: Date, endDate: Date): Promise<{
    totalMessages: number;
    sentMessages: number;
    receivedMessages: number;
    averagePerDay: number;
  }> {
    // Implémentation simplifiée - dans un vrai projet,
    // il faudrait récupérer les données depuis Graph API avec filtres de dates
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    return {
      totalMessages: 0,
      sentMessages: 0,
      receivedMessages: 0,
      averagePerDay: 0
    };
  }

  /**
   * Statistiques de synchronisation pour une période
   */
  private async getSyncStatsForPeriod(startDate: Date, endDate: Date): Promise<{
    successfulSyncs: number;
    failedSyncs: number;
    averageSyncTime: number;
    syncReliability: number;
  }> {
    // Implémentation simplifiée
    return {
      successfulSyncs: 0,
      failedSyncs: 0,
      averageSyncTime: 0,
      syncReliability: 0
    };
  }

  /**
   * Statistiques d'engagement utilisateur
   */
  private async getUserEngagementStats(startDate: Date, endDate: Date): Promise<{
    activeUsers: number;
    messageReaders: number;
    engagementRate: number;
  }> {
    // Implémentation simplifiée
    return {
      activeUsers: 0,
      messageReaders: 0,
      engagementRate: 0
    };
  }

  /**
   * Gérer les erreurs de manière centralisée
   */
  private handleError(
    error: any,
    defaultCode: string,
    defaultMessage: string
  ): GraphOperationResult<any> {
    console.error(defaultMessage, error);

    return {
      success: false,
      error: {
        code: defaultCode,
        message: defaultMessage,
        details: error
      }
    };
  }
}

export {
  GraphStatsService,
  type OrganizationStats,
  type UserActivityStats,
  type MailboxSummary,
  type StatsTimeframe,
  type PerformanceReport,
  type QuickStats,
  type QuickStatsOptions
};