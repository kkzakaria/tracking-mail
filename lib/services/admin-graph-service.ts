/**
 * Service Microsoft Graph administratif
 * Séparé complètement de l'authentification utilisateur
 * Réservé aux opérations backend et configuration par les administrateurs
 */

import { Client } from '@microsoft/microsoft-graph-client';
import { ConfidentialClientApplication, ClientCredentialRequest } from '@azure/msal-node';
import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';
import { encryptData, decryptData } from '@/lib/utils/encryption';
import type {
  MicrosoftUser,
  GraphApiUser,
  GraphApiMessage,
  RateLimitInfo,
  GraphRequestOptions
} from '@/lib/types/microsoft-graph';
import type { MicrosoftGraphConfig } from '@/lib/types/supabase';

/**
 * Configuration Microsoft Graph pour l'administration
 */
interface AdminGraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  isActive: boolean;
  permissions: string[];
}

/**
 * Résultat d'une opération Microsoft Graph
 */
interface GraphOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Service Microsoft Graph administratif
 * Gère les opérations backend avec permissions application
 */
export class AdminGraphService {
  private static instance: AdminGraphService;
  private confidentialClient: ConfidentialClientApplication | null = null;
  private currentConfig: AdminGraphConfig | null = null;
  private rateLimitCache = new Map<string, RateLimitInfo>();
  private tokenCache: { token: string; expiresAt: number } | null = null;

  private constructor() {}

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
      const config = await this.getStoredConfig();

      if (!config) {
        return {
          success: false,
          error: {
            code: 'NO_CONFIG',
            message: 'Microsoft Graph n\'est pas configuré'
          }
        };
      }

      if (!config.isActive) {
        return {
          success: false,
          error: {
            code: 'CONFIG_INACTIVE',
            message: 'La configuration Microsoft Graph est désactivée'
          }
        };
      }

      this.currentConfig = config;
      this.confidentialClient = new ConfidentialClientApplication({
        auth: {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          authority: `https://login.microsoftonline.com/${config.tenantId}`
        }
      });

      return { success: true, data: true };

    } catch (error) {
      console.error('Error initializing AdminGraphService:', error);
      return {
        success: false,
        error: {
          code: 'INIT_ERROR',
          message: 'Erreur lors de l\'initialisation du service Graph',
          details: error
        }
      };
    }
  }

  /**
   * Configurer Microsoft Graph (admin uniquement)
   */
  async configureGraph(
    config: Omit<AdminGraphConfig, 'isActive'>,
    adminUserId: string
  ): Promise<GraphOperationResult<MicrosoftGraphConfig>> {
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

      // Tester la configuration avant de la sauvegarder
      const testResult = await this.testConfiguration(config);
      if (!testResult.success) {
        return {
          success: false,
          error: testResult.error
        };
      }

      // Chiffrer le secret client
      const encryptedSecret = encryptData(config.clientSecret);

      // Sauvegarder la configuration
      const { data: savedConfig, error: saveError } = await supabase
        .from('microsoft_graph_config')
        .upsert({
          tenant_id: config.tenantId,
          client_id: config.clientId,
          client_secret_encrypted: encryptedSecret,
          is_active: true,
          configuration_status: 'configured',
          configured_by: adminUserId,
          configured_at: new Date().toISOString(),
          permissions_granted: JSON.stringify(config.permissions),
          rate_limit_info: JSON.stringify({}),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'tenant_id,client_id'
        })
        .select()
        .single();

      if (saveError) {
        return {
          success: false,
          error: {
            code: 'SAVE_ERROR',
            message: 'Erreur lors de la sauvegarde de la configuration',
            details: saveError
          }
        };
      }

      // Réinitialiser le service avec la nouvelle config
      await this.initialize();

      return { success: true, data: savedConfig };

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
   * Tester une configuration Microsoft Graph
   */
  private async testConfiguration(config: Omit<AdminGraphConfig, 'isActive'>): Promise<GraphOperationResult<boolean>> {
    try {
      const testClient = new ConfidentialClientApplication({
        auth: {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          authority: `https://login.microsoftonline.com/${config.tenantId}`
        }
      });

      const clientCredentialRequest: ClientCredentialRequest = {
        scopes: ['https://graph.microsoft.com/.default']
      };

      const response = await testClient.acquireTokenByClientCredential(clientCredentialRequest);

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
   * Obtenir la configuration stockée en base
   */
  private async getStoredConfig(): Promise<AdminGraphConfig | null> {
    try {
      const supabase = await createSupabaseServerClient();

      const { data, error } = await supabase
        .from('microsoft_graph_config')
        .select('*')
        .eq('is_active', true)
        .eq('configuration_status', 'configured')
        .single();

      if (error || !data) {
        return null;
      }

      // Déchiffrer le secret client
      const clientSecret = decryptData(data.client_secret_encrypted);

      return {
        tenantId: data.tenant_id,
        clientId: data.client_id,
        clientSecret,
        isActive: data.is_active,
        permissions: Array.isArray(data.permissions_granted)
          ? data.permissions_granted as string[]
          : JSON.parse(data.permissions_granted as string || '[]')
      };

    } catch (error) {
      console.error('Error getting stored config:', error);
      return null;
    }
  }

  /**
   * Acquérir un token d'accès application
   */
  private async acquireApplicationToken(): Promise<string | null> {
    try {
      if (!this.confidentialClient || !this.currentConfig) {
        const initResult = await this.initialize();
        if (!initResult.success || !this.confidentialClient) {
          throw new Error('Service non initialisé');
        }
      }

      // Vérifier le cache du token
      if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 300000) { // 5 min de marge
        return this.tokenCache.token;
      }

      const clientCredentialRequest: ClientCredentialRequest = {
        scopes: ['https://graph.microsoft.com/.default']
      };

      const response = await this.confidentialClient!.acquireTokenByClientCredential(clientCredentialRequest);

      if (!response?.accessToken) {
        throw new Error('Impossible d\'obtenir un token d\'accès');
      }

      // Mettre en cache le token
      this.tokenCache = {
        token: response.accessToken,
        expiresAt: Date.now() + ((response.expiresOn?.getTime() || Date.now()) - Date.now())
      };

      return response.accessToken;

    } catch (error) {
      console.error('Error acquiring application token:', error);
      return null;
    }
  }

  /**
   * Créer un client Graph authentifié
   */
  private async createGraphClient(): Promise<Client | null> {
    const token = await this.acquireApplicationToken();
    if (!token) {
      return null;
    }

    return Client.init({
      authProvider: async () => token,
      defaultVersion: 'v1.0'
    });
  }

  /**
   * Obtenir tous les utilisateurs de l'organisation (admin uniquement)
   */
  async getAllUsers(options?: GraphRequestOptions): Promise<GraphOperationResult<MicrosoftUser[]>> {
    try {
      const client = await this.createGraphClient();
      if (!client) {
        return {
          success: false,
          error: {
            code: 'NO_CLIENT',
            message: 'Impossible de créer le client Graph'
          }
        };
      }

      let users: MicrosoftUser[] = [];
      let nextLink: string | null = '/users';

      while (nextLink) {
        const response = await this.executeWithRetry(
          () => client.api(nextLink!)
            .select('id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,department,accountEnabled')
            .top(100)
            .get(),
          options
        );

        users = users.concat(response.value.map((user: GraphApiUser) => ({
          id: user.id,
          displayName: user.displayName,
          mail: user.mail,
          userPrincipalName: user.userPrincipalName,
          givenName: user.givenName,
          surname: user.surname,
          jobTitle: user.jobTitle,
          department: user.department
        })));

        nextLink = response['@odata.nextLink']
          ? new URL(response['@odata.nextLink']).pathname + new URL(response['@odata.nextLink']).search
          : null;
      }

      return { success: true, data: users };

    } catch (error) {
      console.error('Error getting all users:', error);
      return {
        success: false,
        error: {
          code: 'GET_USERS_ERROR',
          message: 'Erreur lors de la récupération des utilisateurs',
          details: error
        }
      };
    }
  }

  /**
   * Synchroniser une boîte email spécifique
   */
  async syncMailbox(emailAddress: string): Promise<GraphOperationResult<{ messageCount: number }>> {
    try {
      const client = await this.createGraphClient();
      if (!client) {
        return {
          success: false,
          error: {
            code: 'NO_CLIENT',
            message: 'Impossible de créer le client Graph'
          }
        };
      }

      // Obtenir les messages de la boîte
      const messages = await client
        .api(`/users/${emailAddress}/messages`)
        .select('id,subject,from,receivedDateTime,bodyPreview,isRead')
        .top(100)
        .orderby('receivedDateTime desc')
        .get();

      // Mettre à jour le statut de synchronisation dans Supabase
      const supabase = await createSupabaseServerClient();
      await supabase
        .from('mailboxes')
        .update({
          last_sync_at: new Date().toISOString(),
          sync_status: 'completed',
          sync_error: null,
          updated_at: new Date().toISOString()
        })
        .eq('email_address', emailAddress);

      return {
        success: true,
        data: { messageCount: messages.value?.length || 0 }
      };

    } catch (error) {
      console.error('Error syncing mailbox:', error);

      // Mettre à jour le statut d'erreur
      const supabase = await createSupabaseServerClient();
      await supabase
        .from('mailboxes')
        .update({
          last_sync_at: new Date().toISOString(),
          sync_status: 'error',
          sync_error: error instanceof Error ? error.message : 'Erreur inconnue',
          updated_at: new Date().toISOString()
        })
        .eq('email_address', emailAddress);

      return {
        success: false,
        error: {
          code: 'SYNC_ERROR',
          message: 'Erreur lors de la synchronisation de la boîte email',
          details: error
        }
      };
    }
  }

  /**
   * Obtenir les emails d'une boîte spécifique
   */
  async getMailboxMessages(
    emailAddress: string,
    options?: { limit?: number; unreadOnly?: boolean }
  ): Promise<GraphOperationResult<GraphApiMessage[]>> {
    try {
      const client = await this.createGraphClient();
      if (!client) {
        return {
          success: false,
          error: {
            code: 'NO_CLIENT',
            message: 'Impossible de créer le client Graph'
          }
        };
      }

      let query = client
        .api(`/users/${emailAddress}/messages`)
        .select('id,subject,from,receivedDateTime,bodyPreview,isRead,importance')
        .top(options?.limit || 50)
        .orderby('receivedDateTime desc');

      if (options?.unreadOnly) {
        query = query.filter('isRead eq false');
      }

      const response = await query.get();

      return {
        success: true,
        data: response.value || []
      };

    } catch (error) {
      console.error('Error getting mailbox messages:', error);
      return {
        success: false,
        error: {
          code: 'GET_MESSAGES_ERROR',
          message: 'Erreur lors de la récupération des emails',
          details: error
        }
      };
    }
  }

  /**
   * Envoyer un email au nom d'un utilisateur (admin uniquement)
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
    try {
      const client = await this.createGraphClient();
      if (!client) {
        return {
          success: false,
          error: {
            code: 'NO_CLIENT',
            message: 'Impossible de créer le client Graph'
          }
        };
      }

      const emailMessage = {
        subject: message.subject,
        importance: message.importance || 'normal',
        body: {
          contentType: 'HTML',
          content: message.body
        },
        toRecipients: message.toRecipients.map(email => ({
          emailAddress: {
            address: email
          }
        })),
        ccRecipients: message.ccRecipients?.map(email => ({
          emailAddress: {
            address: email
          }
        })) || []
      };

      const response = await client
        .api(`/users/${senderEmail}/sendMail`)
        .post({ message: emailMessage });

      return {
        success: true,
        data: { messageId: response.id || 'unknown' }
      };

    } catch (error) {
      console.error('Error sending email:', error);
      return {
        success: false,
        error: {
          code: 'SEND_ERROR',
          message: 'Erreur lors de l\'envoi de l\'email',
          details: error
        }
      };
    }
  }

  /**
   * Obtenir les statistiques de l'organisation
   */
  async getOrganizationStats(): Promise<GraphOperationResult<{
    totalUsers: number;
    activeUsers: number;
    totalMailboxes: number;
    lastSyncInfo: { total: number; syncing: number; errors: number; };
  }>> {
    try {
      const client = await this.createGraphClient();
      if (!client) {
        return {
          success: false,
          error: {
            code: 'NO_CLIENT',
            message: 'Impossible de créer le client Graph'
          }
        };
      }

      // Statistiques utilisateurs Graph
      const usersResponse = await client.api('/users').select('id,accountEnabled').get();
      const totalUsers = usersResponse.value?.length || 0;
      const activeUsers = usersResponse.value?.filter((user: any) => user.accountEnabled).length || 0;

      // Statistiques boîtes emails Supabase
      const supabase = await createSupabaseServerClient();

      const { count: totalMailboxes } = await supabase
        .from('mailboxes')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      const { data: syncStats } = await supabase
        .from('mailboxes')
        .select('sync_status')
        .eq('is_active', true);

      const lastSyncInfo = {
        total: syncStats?.length || 0,
        syncing: syncStats?.filter((s: { sync_status: string }) => s.sync_status === 'syncing').length || 0,
        errors: syncStats?.filter((s: { sync_status: string }) => s.sync_status === 'error').length || 0
      };

      return {
        success: true,
        data: {
          totalUsers,
          activeUsers,
          totalMailboxes: totalMailboxes || 0,
          lastSyncInfo
        }
      };

    } catch (error) {
      console.error('Error getting organization stats:', error);
      return {
        success: false,
        error: {
          code: 'STATS_ERROR',
          message: 'Erreur lors de la récupération des statistiques',
          details: error
        }
      };
    }
  }

  /**
   * Exécuter une requête avec retry et gestion des erreurs
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: GraphRequestOptions = {}
  ): Promise<T> {
    const { retries = 3, timeout = 30000 } = options;
    let lastError: Error;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Vérifier le rate limiting
        if (this.isRateLimited()) {
          await this.waitForRateLimit();
        }

        // Exécuter avec timeout
        const result = await Promise.race([
          operation(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
          )
        ]);

        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Ne pas retry sur les erreurs d'authentification
        if (this.isAuthenticationError(error)) {
          throw lastError;
        }

        // Gérer le rate limiting
        if (this.isRateLimitError(error)) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          console.warn(`Rate limited, waiting ${delay}ms before retry ${attempt + 1}/${retries}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Ne pas retry à la dernière tentative
        if (attempt === retries) {
          throw lastError;
        }

        // Backoff exponentiel
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Vérifier si l'erreur est liée à l'authentification
   */
  private isAuthenticationError(error: unknown): boolean {
    const authCodes = ['InvalidAuthenticationToken', 'AuthenticationFailed', 'Forbidden', 'Unauthorized'];
    const errorObj = error as any;

    return authCodes.some(code =>
      errorObj?.code === code ||
      errorObj?.response?.status === 401 ||
      errorObj?.response?.status === 403
    );
  }

  /**
   * Vérifier si l'erreur est liée au rate limiting
   */
  private isRateLimitError(error: unknown): boolean {
    const errorObj = error as any;
    return errorObj?.code === 'TooManyRequests' || errorObj?.response?.status === 429;
  }

  /**
   * Vérifier si actuellement rate limited
   */
  private isRateLimited(): boolean {
    const now = Date.now();
    const rateLimitInfo = this.rateLimitCache.get('global');
    return rateLimitInfo ? (rateLimitInfo.remaining <= 0 && now < rateLimitInfo.reset) : false;
  }

  /**
   * Attendre que le rate limit se réinitialise
   */
  private async waitForRateLimit(): Promise<void> {
    const rateLimitInfo = this.rateLimitCache.get('global');
    if (!rateLimitInfo) return;

    const waitTime = Math.max(0, rateLimitInfo.reset - Date.now());
    if (waitTime > 0) {
      console.warn(`Rate limited, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Obtenir l'état du service
   */
  async getServiceStatus(): Promise<GraphOperationResult<{
    isInitialized: boolean;
    isConfigured: boolean;
    configurationStatus: string;
    lastTokenRefresh?: string;
    rateLimitInfo?: RateLimitInfo;
  }>> {
    try {
      const supabase = await createSupabaseServerClient();

      const { data: config } = await supabase
        .from('microsoft_graph_config')
        .select('configuration_status, last_token_refresh, rate_limit_info, is_active')
        .eq('is_active', true)
        .single();

      return {
        success: true,
        data: {
          isInitialized: !!this.confidentialClient,
          isConfigured: !!config,
          configurationStatus: config?.configuration_status || 'not_configured',
          lastTokenRefresh: config?.last_token_refresh || undefined,
          rateLimitInfo: this.rateLimitCache.get('global')
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
}