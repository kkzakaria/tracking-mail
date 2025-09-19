/**
 * Service de configuration Microsoft Graph
 * Responsable de la gestion et validation de la configuration
 */

import type { GraphOperationResult } from '@/lib/types/microsoft-graph';

/**
 * Configuration Microsoft Graph pour l'administration
 */
export interface AdminGraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  isActive: boolean;
  permissions: string[];
}

/**
 * Options de validation de configuration
 */
interface ConfigValidationOptions {
  testConnection?: boolean;
  checkPermissions?: boolean;
}

/**
 * Service de gestion de la configuration Microsoft Graph
 */
export class GraphConfigService {
  private static instance: GraphConfigService;
  private currentConfig: AdminGraphConfig | null = null;

  private constructor() {}

  /**
   * Obtenir l'instance unique du service
   */
  static getInstance(): GraphConfigService {
    if (!GraphConfigService.instance) {
      GraphConfigService.instance = new GraphConfigService();
    }
    return GraphConfigService.instance;
  }

  /**
   * Obtenir la configuration depuis les variables d'environnement
   */
  async getStoredConfig(): Promise<AdminGraphConfig | null> {
    try {
      const tenantId = process.env.MICROSOFT_TENANT_ID;
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

      if (!tenantId || !clientId || !clientSecret) {
        return null;
      }

      this.currentConfig = {
        tenantId,
        clientId,
        clientSecret,
        isActive: true,
        permissions: [
          'https://graph.microsoft.com/Mail.Read',
          'https://graph.microsoft.com/Mail.ReadWrite',
          'https://graph.microsoft.com/User.Read'
        ]
      };

      return this.currentConfig;

    } catch (error) {
      console.error('Error getting stored config:', error);
      return null;
    }
  }

  /**
   * Obtenir la configuration actuelle en cache
   */
  getCurrentConfig(): AdminGraphConfig | null {
    return this.currentConfig;
  }

  /**
   * Valider une configuration Microsoft Graph
   */
  async validateConfiguration(
    config: AdminGraphConfig,
    options?: ConfigValidationOptions
  ): Promise<GraphOperationResult<boolean>> {
    try {
      // Validation des champs requis
      if (!config.tenantId || !config.clientId || !config.clientSecret) {
        return {
          success: false,
          error: {
            code: 'INVALID_CONFIG',
            message: 'Configuration incomplète : tous les champs sont requis'
          }
        };
      }

      // Validation du format tenant ID
      const tenantIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^common$|^organizations$|^consumers$/i;
      if (!tenantIdPattern.test(config.tenantId)) {
        return {
          success: false,
          error: {
            code: 'INVALID_TENANT',
            message: 'Format de tenant ID invalide'
          }
        };
      }

      // Validation du format client ID (GUID)
      const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!guidPattern.test(config.clientId)) {
        return {
          success: false,
          error: {
            code: 'INVALID_CLIENT_ID',
            message: 'Format de client ID invalide'
          }
        };
      }

      // Test de connexion si demandé
      if (options?.testConnection) {
        const testResult = await this.testConfiguration(config);
        if (!testResult.success) {
          return testResult;
        }
      }

      return { success: true, data: true };

    } catch (error) {
      console.error('Error validating configuration:', error);
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Erreur lors de la validation de la configuration',
          details: error
        }
      };
    }
  }

  /**
   * Tester une configuration Microsoft Graph
   */
  private async testConfiguration(config: AdminGraphConfig): Promise<GraphOperationResult<boolean>> {
    try {
      // Import dynamique pour éviter les dépendances circulaires
      const { ConfidentialClientApplication } = await import('@azure/msal-node');
      const { Client } = await import('@microsoft/microsoft-graph-client');

      const testClient = new ConfidentialClientApplication({
        auth: {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          authority: `https://login.microsoftonline.com/${config.tenantId}`
        }
      });

      const response = await testClient.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default']
      });

      if (!response?.accessToken) {
        return {
          success: false,
          error: {
            code: 'TEST_FAILED',
            message: 'Impossible d\'obtenir un token d\'accès avec cette configuration'
          }
        };
      }

      // Test basique : récupérer les informations sur l'organisation
      const graphClient = Client.init({
        authProvider: async () => response.accessToken,
        defaultVersion: 'v1.0'
      });

      await graphClient.api('/organization').get();

      return { success: true, data: true };

    } catch (error) {
      console.error('Configuration test failed:', error);
      return {
        success: false,
        error: {
          code: 'TEST_FAILED',
          message: 'La configuration Microsoft Graph est invalide',
          details: error
        }
      };
    }
  }

  /**
   * Vérifier si la configuration est active
   */
  isConfigurationActive(): boolean {
    return this.currentConfig?.isActive ?? false;
  }

  /**
   * Obtenir les permissions configurées
   */
  getConfiguredPermissions(): string[] {
    return this.currentConfig?.permissions ?? [];
  }

  /**
   * Mettre à jour la configuration en cache
   */
  async refreshConfig(): Promise<GraphOperationResult<AdminGraphConfig>> {
    const config = await this.getStoredConfig();

    if (!config) {
      return {
        success: false,
        error: {
          code: 'NO_CONFIG',
          message: 'Aucune configuration Microsoft Graph trouvée'
        }
      };
    }

    return { success: true, data: config };
  }

  /**
   * Réinitialiser la configuration
   */
  clearConfig(): void {
    this.currentConfig = null;
  }
}