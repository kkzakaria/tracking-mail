/**
 * Service Microsoft Graph administratif - Facade Pattern
 * Coordonne tous les services Graph spécialisés
 * Maintient la compatibilité avec l'API existante
 */

import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';
import { GraphConfigService, type AdminGraphConfig } from './graph/core/graph-config-service';
import { GraphTokenService } from './graph/core/graph-token-service';
import { GraphRateLimitService } from './graph/core/graph-rate-limit-service';
import { GraphClientFactory } from './graph/core/graph-client-factory';
import { GraphUserService, type UserFilterOptions } from './graph/domain/graph-user-service';
import { GraphMailboxService, type MailboxStats, type MailboxMessageOptions, type PeriodStatsOptions } from './graph/domain/graph-mailbox-service';
import { GraphMailSenderService, type EmailMessage } from './graph/domain/graph-mail-sender-service';
import { GraphStatsService, type OrganizationStats } from './graph/domain/graph-stats-service';
import type {
  MicrosoftUser,
  GraphApiMessage,
  RateLimitInfo,
  GraphRequestOptions,
  GraphOperationResult
} from '@/lib/types/microsoft-graph';

/**
 * Service Microsoft Graph administratif - Facade
 * Coordonne tous les services spécialisés tout en maintenant l'API existante
 */
export class AdminGraphService {
  private static instance: AdminGraphService;
  private configService: GraphConfigService;
  private tokenService: GraphTokenService;
  private rateLimitService: GraphRateLimitService;
  private clientFactory: GraphClientFactory;
  private userService: GraphUserService;
  private mailboxService: GraphMailboxService;
  private mailSenderService: GraphMailSenderService;
  private statsService: GraphStatsService;

  private constructor() {
    // Initialiser tous les services spécialisés
    this.configService = GraphConfigService.getInstance();
    this.tokenService = GraphTokenService.getInstance();
    this.rateLimitService = GraphRateLimitService.getInstance();
    this.clientFactory = GraphClientFactory.getInstance();
    this.userService = GraphUserService.getInstance();
    this.mailboxService = GraphMailboxService.getInstance();
    this.mailSenderService = GraphMailSenderService.getInstance();
    this.statsService = GraphStatsService.getInstance();
  }

  static getInstance(): AdminGraphService {
    if (!AdminGraphService.instance) {
      AdminGraphService.instance = new AdminGraphService();
    }
    return AdminGraphService.instance;
  }

  /**
   * Initialiser le service avec la configuration stockée en base
   */
  async initialize(): Promise<GraphOperationResult<boolean>> {
    try {
      // Initialiser tous les services core dans l'ordre
      const configResult = await this.configService.refreshConfig();
      if (!configResult.success) {
        return configResult;
      }

      const tokenResult = await this.tokenService.initialize();
      if (!tokenResult.success) {
        return tokenResult;
      }

      return { success: true, data: true };

    } catch (error) {
      console.error('Error initializing AdminGraphService facade:', error);
      return {
        success: false,
        error: {
          code: 'FACADE_INIT_ERROR',
          message: 'Erreur lors de l\'initialisation du service Graph',
          details: error
        }
      };
    }
  }

  /**
   * Configurer Microsoft Graph (admin uniquement)
   * Délègue vers GraphConfigService
   */
  async configureGraph(
    config: Omit<AdminGraphConfig, 'isActive'>,
    adminUserId: string
  ): Promise<GraphOperationResult<any>> {
    try {
      const supabase = await createSupabaseServerClient();

      // Vérifier que l'utilisateur est admin
      const { data: adminProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', adminUserId)
        .eq('role', 'admin')
        .single();

      if (profileError || !adminProfile) {
        return {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Seuls les administrateurs peuvent configurer Microsoft Graph'
          }
        };
      }

      // Valider et tester la configuration
      const validationResult = await this.configService.validateConfiguration(
        { ...config, isActive: true },
        { testConnection: true }
      );

      if (!validationResult.success) {
        return validationResult;
      }

      // Réinitialiser les services
      await this.initialize();

      return {
        success: true,
        data: {
          message: 'Configuration validée avec succès. Utilisation des variables d\'environnement.'
        }
      };

    } catch (error) {
      console.error('Error configuring Microsoft Graph:', error);
      return {
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'Erreur lors de la configuration de Microsoft Graph',
          details: error
        }
      };
    }
  }

  /**
   * Obtenir tous les utilisateurs de l'organisation (admin uniquement)
   * Délègue vers GraphUserService
   */
  async getAllUsers(options?: GraphRequestOptions): Promise<GraphOperationResult<MicrosoftUser[]>> {
    return this.userService.getAllUsers(options);
  }

  /**
   * Synchroniser une boîte email spécifique
   * Délègue vers GraphMailboxService
   */
  async syncMailbox(emailAddress: string): Promise<GraphOperationResult<{ messageCount: number }>> {
    const result = await this.mailboxService.syncMailbox(emailAddress);
    if (result.success && result.data) {
      return {
        success: true,
        data: { messageCount: result.data.messageCount }
      };
    }
    return result;
  }

  /**
   * Obtenir les emails d'une boîte spécifique
   * Délègue vers GraphMailboxService
   */
  async getMailboxMessages(
    emailAddress: string,
    options?: { limit?: number; unreadOnly?: boolean }
  ): Promise<GraphOperationResult<GraphApiMessage[]>> {
    const mailboxOptions: MailboxMessageOptions = {
      limit: options?.limit,
      unreadOnly: options?.unreadOnly
    };
    return this.mailboxService.getMailboxMessages(emailAddress, mailboxOptions);
  }

  /**
   * Envoyer un email au nom d'un utilisateur (admin uniquement)
   * Délègue vers GraphMailSenderService
   */
  async sendMailAsUser(
    senderEmail: string,
    message: {
      subject: string;
      body: string;
      toRecipients: string[];
      ccRecipients?: string[];
      importance?: 'low' | 'normal' | 'high';
    }
  ): Promise<GraphOperationResult<{ messageId: string }>> {
    const emailMessage: EmailMessage = {
      subject: message.subject,
      body: message.body,
      toRecipients: message.toRecipients,
      ccRecipients: message.ccRecipients,
      importance: message.importance,
      isHtml: true // Par défaut HTML pour compatibilité
    };

    const result = await this.mailSenderService.sendMailAsUser(senderEmail, emailMessage);
    if (result.success && result.data) {
      return {
        success: true,
        data: { messageId: result.data.messageId }
      };
    }
    return result;
  }

  /**
   * Obtenir les statistiques de l'organisation
   * Délègue vers GraphStatsService
   */
  async getOrganizationStats(): Promise<GraphOperationResult<{
    totalUsers: number;
    activeUsers: number;
    totalMailboxes: number;
    lastSyncInfo: { total: number; syncing: number; errors: number; };
  }>> {
    const result = await this.statsService.getOrganizationStats();
    if (result.success && result.data) {
      const orgStats = result.data;
      return {
        success: true,
        data: {
          totalUsers: orgStats.totalUsers,
          activeUsers: orgStats.activeUsers,
          totalMailboxes: orgStats.totalMailboxes,
          lastSyncInfo: orgStats.lastSyncInfo
        }
      };
    }
    return result;
  }

  /**
   * Obtenir tous les dossiers d'une boîte email avec leurs statistiques
   * Délègue vers GraphMailboxService
   */
  async getMailboxFolders(
    emailAddress: string,
    options?: { includeChildFolders?: boolean }
  ): Promise<GraphOperationResult<any[]>> {
    const result = await this.mailboxService.getMailboxFolders(emailAddress, options);
    return result;
  }

  /**
   * Obtenir les statistiques optimisées d'une boîte email pour une période donnée
   * Délègue vers GraphMailboxService
   */
  async getMailboxStatsForPeriod(
    emailAddress: string,
    options?: PeriodStatsOptions
  ): Promise<GraphOperationResult<MailboxStats>> {
    return this.mailboxService.getMailboxStatsForPeriod(emailAddress, options);
  }

  /**
   * Obtenir un aperçu rapide des statistiques sans récupération de messages
   * Délègue vers GraphMailboxService
   */
  async getMailboxQuickStats(emailAddress: string): Promise<GraphOperationResult<MailboxStats>> {
    return this.mailboxService.getMailboxQuickStats(emailAddress);
  }

  /**
   * Obtenir l'état du service
   * Agrège les statuts de tous les services
   */
  async getServiceStatus(): Promise<GraphOperationResult<{
    isInitialized: boolean;
    isConfigured: boolean;
    configurationStatus: string;
    lastTokenRefresh?: string;
    rateLimitInfo?: RateLimitInfo;
  }>> {
    try {
      const config = this.configService.getCurrentConfig();
      const tokenStatus = this.tokenService.getServiceStatus();
      const rateLimitStatus = this.rateLimitService.getServiceStatus();

      return {
        success: true,
        data: {
          isInitialized: tokenStatus.isInitialized,
          isConfigured: !!config && this.configService.isConfigurationActive(),
          configurationStatus: config ? 'configured' : 'not_configured',
          lastTokenRefresh: undefined, // Non applicable avec le nouveau système
          rateLimitInfo: rateLimitStatus.rateLimitInfo
        }
      };

    } catch (error) {
      return {
        success: false,
        error: {
          code: 'STATUS_ERROR',
          message: 'Erreur lors de la vérification du statut',
          details: error
        }
      };
    }
  }

  /**
   * Obtenir des informations détaillées sur tous les services
   * Nouvelle méthode pour diagnostiquer l'état du système
   */
  async getDetailedServiceStatus(): Promise<GraphOperationResult<{
    services: Record<string, any>;
    overall: {
      healthy: boolean;
      issues: string[];
    };
  }>> {
    try {
      const services = {
        config: {
          status: this.configService.isConfigurationActive(),
          config: !!this.configService.getCurrentConfig()
        },
        token: this.tokenService.getServiceStatus(),
        rateLimit: this.rateLimitService.getServiceStatus(),
        clientFactory: this.clientFactory.getFactoryStatus()
      };

      const issues: string[] = [];

      if (!services.config.status) {
        issues.push('Configuration Microsoft Graph inactive');
      }
      if (!services.token.isInitialized) {
        issues.push('Service de tokens non initialisé');
      }
      if (services.rateLimit.isRateLimited) {
        issues.push('Rate limit actif');
      }

      return {
        success: true,
        data: {
          services,
          overall: {
            healthy: issues.length === 0,
            issues
          }
        }
      };

    } catch (error) {
      return {
        success: false,
        error: {
          code: 'DETAILED_STATUS_ERROR',
          message: 'Erreur lors de la récupération du statut détaillé',
          details: error
        }
      };
    }
  }

  /**
   * Nettoyer tous les caches et réinitialiser les services
   * Nouvelle méthode utilitaire pour le debugging
   */
  async resetServices(): Promise<GraphOperationResult<boolean>> {
    try {
      this.tokenService.clearTokenCache();
      this.rateLimitService.clearRateLimitInfo();
      this.clientFactory.clearClientCache();
      this.configService.clearConfig();

      const initResult = await this.initialize();
      return initResult;

    } catch (error) {
      return {
        success: false,
        error: {
          code: 'RESET_ERROR',
          message: 'Erreur lors de la réinitialisation des services',
          details: error
        }
      };
    }
  }
}