/**
 * Index des services Microsoft Graph
 * Point d'entrée pour tous les services Graph refactorisés
 */

// Services Core - Infrastructure
export { GraphConfigService, type AdminGraphConfig } from './core/graph-config-service';
export { GraphTokenService } from './core/graph-token-service';
export { GraphRateLimitService, type RetryOptions } from './core/graph-rate-limit-service';
export { GraphClientFactory, type GraphClientOptions } from './core/graph-client-factory';

// Services Domain - Métier
export { GraphUserService, type UserFilterOptions, type UserSelectOptions, type UserStatistics } from './domain/graph-user-service';
export { GraphMailboxService, type MailboxStats, type MailFolderStats, type MailboxMessageOptions, type PeriodStatsOptions, type SyncResult } from './domain/graph-mailbox-service';
export { GraphMailSenderService, type EmailMessage, type EmailAttachment, type SendResult, type BulkSendOptions } from './domain/graph-mail-sender-service';
export { GraphStatsService, type OrganizationStats, type UserActivityStats, type MailboxSummary, type StatsTimeframe, type PerformanceReport } from './domain/graph-stats-service';

// Types partagés
export type * from '../types/graph-services';

// Utilitaires pour créer des instances de service
export const createGraphServices = () => ({
  config: GraphConfigService.getInstance(),
  token: GraphTokenService.getInstance(),
  rateLimit: GraphRateLimitService.getInstance(),
  clientFactory: GraphClientFactory.getInstance(),
  users: GraphUserService.getInstance(),
  mailbox: GraphMailboxService.getInstance(),
  mailSender: GraphMailSenderService.getInstance(),
  stats: GraphStatsService.getInstance()
});

// Factory pour initialiser tous les services
export const initializeGraphServices = async () => {
  const services = createGraphServices();

  try {
    // Initialiser les services core dans l'ordre
    const configResult = await services.config.refreshConfig();
    if (!configResult.success) {
      throw new Error(`Config initialization failed: ${configResult.error?.message}`);
    }

    const tokenResult = await services.token.initialize();
    if (!tokenResult.success) {
      throw new Error(`Token service initialization failed: ${tokenResult.error?.message}`);
    }

    return {
      success: true,
      services,
      message: 'All Graph services initialized successfully'
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown initialization error',
      services: null
    };
  }
};

// Helper pour obtenir le statut de santé global
export const getGraphServicesHealth = async () => {
  const services = createGraphServices();

  try {
    const health = {
      config: {
        isActive: services.config.isConfigurationActive(),
        hasConfig: !!services.config.getCurrentConfig()
      },
      token: services.token.getServiceStatus(),
      rateLimit: services.rateLimit.getServiceStatus(),
      clientFactory: services.clientFactory.getFactoryStatus()
    };

    const isHealthy =
      health.config.isActive &&
      health.config.hasConfig &&
      health.token.isInitialized &&
      !health.rateLimit.isRateLimited;

    return {
      healthy: isHealthy,
      services: health,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Health check failed',
      timestamp: new Date().toISOString()
    };
  }
};