/**
 * Service Microsoft Graph administratif
 * Séparé complètement de l'authentification utilisateur
 * Réservé aux opérations backend et configuration par les administrateurs
 */

import { Client } from '@microsoft/microsoft-graph-client';
import { ConfidentialClientApplication, ClientCredentialRequest } from '@azure/msal-node';
import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';
import type {
  MicrosoftUser,
  GraphApiUser,
  GraphApiMessage,
  RateLimitInfo,
  GraphRequestOptions
} from '@/lib/types/microsoft-graph';

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
 * Statistiques de dossier email
 */
interface MailFolderStats {
  id: string;
  displayName: string;
  parentFolderId?: string;
  totalItemCount: number;
  unreadItemCount: number;
  childFolderCount: number;
  isHidden: boolean;
  wellKnownName?: string;
}

/**
 * Statistiques agrégées de boîte email
 */
interface MailboxStats {
  emailAddress: string;
  totalMessages: number;
  unreadMessages: number;
  folders: MailFolderStats[];
  periodFilter?: {
    startDate: string;
    endDate: string;
  };
}

/**
 * Options pour les statistiques de période
 */
interface PeriodStatsOptions {
  startDate?: string; // ISO date string
  endDate?: string;   // ISO date string
  includeChildFolders?: boolean;
  onlyUserFolders?: boolean; // Exclut les dossiers système
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
   * Note: Utilise maintenant les variables d'environnement directement
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

      // Tester la configuration
      const testResult = await this.testConfiguration(config);
      if (!testResult.success) {
        return {
          success: false,
          error: testResult.error
        };
      }

      // Réinitialiser le service avec la configuration testée
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
   * Obtenir la configuration depuis les variables d'environnement
   */
  private async getStoredConfig(): Promise<AdminGraphConfig | null> {
    try {
      const tenantId = process.env.MICROSOFT_TENANT_ID;
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

      if (!tenantId || !clientId || !clientSecret) {
        return null;
      }

      return {
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

      const response = await this.executeWithRetry(
        () => query.get(),
        {
          timeout: 15000,
          retries: 2
        }
      );

      return {
        success: true,
        data: response.value || []
      };

    } catch (error) {
      console.error(`Error getting mailbox messages for ${emailAddress}:`, error);

      let errorCode = 'GET_MESSAGES_ERROR';
      let errorMessage = 'Erreur lors de la récupération des emails';

      if (error instanceof Error) {
        if (error.message === 'Request timeout') {
          errorCode = 'TIMEOUT_ERROR';
          errorMessage = `Timeout lors de la récupération des emails de ${emailAddress}`;
        } else if (error.message.includes('401') || error.message.includes('authentication')) {
          errorCode = 'AUTH_ERROR';
          errorMessage = 'Erreur d\'authentification Microsoft Graph';
        } else if (error.message.includes('403') || error.message.includes('permission')) {
          errorCode = 'PERMISSION_ERROR';
          errorMessage = `Permissions insuffisantes pour accéder à ${emailAddress}`;
        } else if (error.message.includes('404')) {
          errorCode = 'MAILBOX_NOT_FOUND';
          errorMessage = `Boîte email ${emailAddress} non trouvée`;
        }
      }

      return {
        success: false,
        error: {
          code: errorCode,
          message: errorMessage,
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
        syncing: syncStats?.filter((s: { sync_status: string | null }) => s.sync_status === 'syncing').length || 0,
        errors: syncStats?.filter((s: { sync_status: string | null }) => s.sync_status === 'error').length || 0
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
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        if (attempt === retries) {
          throw lastError;
        }

        const delay = Math.pow(2, attempt) * 1000;
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
      // Vérifier la configuration via les variables d'environnement
      const config = await this.getStoredConfig();
      const isConfigured = !!config && !!config.tenantId && !!config.clientId && !!config.clientSecret;

      return {
        success: true,
        data: {
          isInitialized: !!this.confidentialClient,
          isConfigured,
          configurationStatus: isConfigured ? 'configured' : 'not_configured',
          lastTokenRefresh: undefined, // Non applicable avec les variables d'environnement
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

  /**
   * Obtenir tous les dossiers d'une boîte email avec leurs statistiques
   */
  async getMailboxFolders(
    emailAddress: string,
    options?: { includeChildFolders?: boolean }
  ): Promise<GraphOperationResult<MailFolderStats[]>> {
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

      const rootFoldersResponse = await this.executeWithRetry(
        () => client.api(`/users/${emailAddress}/mailFolders`)
          .select('id,displayName,parentFolderId,totalItemCount,unreadItemCount,childFolderCount,isHidden,wellKnownName')
          .get(),
        { timeout: 10000, retries: 2 }
      );

      let allFolders: MailFolderStats[] = rootFoldersResponse.value.map((folder: any) => ({
        id: folder.id,
        displayName: folder.displayName,
        parentFolderId: folder.parentFolderId,
        totalItemCount: folder.totalItemCount || 0,
        unreadItemCount: folder.unreadItemCount || 0,
        childFolderCount: folder.childFolderCount || 0,
        isHidden: folder.isHidden || false,
        wellKnownName: folder.wellKnownName
      }));

      if (options?.includeChildFolders) {
        for (const folder of allFolders) {
          if (folder.childFolderCount > 0) {
            try {
              const childFoldersResponse = await this.executeWithRetry(
                () => client.api(`/users/${emailAddress}/mailFolders/${folder.id}/childFolders`)
                  .select('id,displayName,parentFolderId,totalItemCount,unreadItemCount,childFolderCount,isHidden,wellKnownName')
                  .get(),
                { timeout: 10000, retries: 2 }
              );

              const childFolders: MailFolderStats[] = childFoldersResponse.value.map((childFolder: any) => ({
                id: childFolder.id,
                displayName: childFolder.displayName,
                parentFolderId: childFolder.parentFolderId,
                totalItemCount: childFolder.totalItemCount || 0,
                unreadItemCount: childFolder.unreadItemCount || 0,
                childFolderCount: childFolder.childFolderCount || 0,
                isHidden: childFolder.isHidden || false,
                wellKnownName: childFolder.wellKnownName
              }));

              allFolders = allFolders.concat(childFolders);
            } catch (error) {
              console.error(`Error fetching child folders for ${folder.displayName}:`, error);
            }
          }
        }
      }

      return {
        success: true,
        data: allFolders
      };

    } catch (error) {
      console.error(`Error getting mailbox folders for ${emailAddress}:`, error);
      return {
        success: false,
        error: {
          code: 'GET_FOLDERS_ERROR',
          message: 'Erreur lors de la récupération des dossiers',
          details: error
        }
      };
    }
  }

  /**
   * Obtenir les statistiques optimisées d'une boîte email pour une période donnée
   */
  async getMailboxStatsForPeriod(
    emailAddress: string,
    options?: PeriodStatsOptions
  ): Promise<GraphOperationResult<MailboxStats>> {
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

      const foldersResult = await this.getMailboxFolders(emailAddress, {
        includeChildFolders: options?.includeChildFolders ?? true
      });

      if (!foldersResult.success || !foldersResult.data) {
        return {
          success: false,
          error: foldersResult.error || {
            code: 'FOLDERS_ERROR',
            message: 'Impossible de récupérer les dossiers'
          }
        };
      }

      let folders = foldersResult.data;

      if (options?.onlyUserFolders) {
        folders = folders.filter(folder =>
          !folder.wellKnownName ||
          ['inbox', 'sentitems', 'drafts'].includes(folder.wellKnownName.toLowerCase())
        );
      }

      if (options?.startDate || options?.endDate) {
        const updatedFolders: MailFolderStats[] = [];

        for (const folder of folders) {
          try {
            const dateFilters: string[] = [];

            if (options.startDate) {
              dateFilters.push(`receivedDateTime ge ${options.startDate}`);
            }
            if (options.endDate) {
              dateFilters.push(`receivedDateTime lt ${options.endDate}`);
            }

            const filterQuery = dateFilters.length > 0 ? dateFilters.join(' and ') : '';

            const totalCountResponse = await this.executeWithRetry(
              () => client.api(`/users/${emailAddress}/mailFolders/${folder.id}/messages/$count`)
                .filter(filterQuery)
                .get(),
              { timeout: 8000, retries: 2 }
            );

            const unreadFilter = filterQuery ?
              `${filterQuery} and isRead eq false` :
              'isRead eq false';

            const unreadCountResponse = await this.executeWithRetry(
              () => client.api(`/users/${emailAddress}/mailFolders/${folder.id}/messages/$count`)
                .filter(unreadFilter)
                .get(),
              { timeout: 8000, retries: 2 }
            );

            updatedFolders.push({
              ...folder,
              totalItemCount: totalCountResponse || 0,
              unreadItemCount: unreadCountResponse || 0
            });

          } catch (error) {
            console.error(`Error counting messages for folder ${folder.displayName}:`, error);
            updatedFolders.push(folder);
          }
        }

        folders = updatedFolders;
      }

      const totalMessages = folders.reduce((sum, folder) => sum + folder.totalItemCount, 0);
      const unreadMessages = folders.reduce((sum, folder) => sum + folder.unreadItemCount, 0);

      const stats: MailboxStats = {
        emailAddress,
        totalMessages,
        unreadMessages,
        folders,
        periodFilter: (options?.startDate || options?.endDate) ? {
          startDate: options.startDate || 'all',
          endDate: options.endDate || 'all'
        } : undefined
      };

      return {
        success: true,
        data: stats
      };

    } catch (error) {
      console.error(`Error getting mailbox stats for ${emailAddress}:`, error);
      return {
        success: false,
        error: {
          code: 'GET_STATS_ERROR',
          message: 'Erreur lors de la récupération des statistiques',
          details: error
        }
      };
    }
  }


  /**
   * Obtenir un aperçu rapide des statistiques sans récupération de messages
   */
  async getMailboxQuickStats(emailAddress: string): Promise<GraphOperationResult<MailboxStats>> {
    try {
      const token = await this.acquireApplicationToken();
      if (!token) {
        throw new Error('No token available');
      }

      const url = `https://graph.microsoft.com/v1.0/users/${emailAddress}/mailFolders?$select=id,displayName,totalItemCount,unreadItemCount,childFolderCount`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const foldersResponse = await response.json();
      const folders = foldersResponse.value || [];

      let totalMessages = 0;
      let unreadMessages = 0;

      folders.forEach((folder: any) => {
        totalMessages += folder.totalItemCount || 0;
        unreadMessages += folder.unreadItemCount || 0;
      });

      return {
        success: true,
        data: {
          emailAddress,
          totalMessages,
          unreadMessages,
          folders: folders.map((folder: any) => ({
            id: folder.id,
            displayName: folder.displayName,
            totalItemCount: folder.totalItemCount || 0,
            unreadItemCount: folder.unreadItemCount || 0,
            childFolderCount: folder.childFolderCount || 0
          }))
        }
      };

    } catch (error) {
      console.error(`Error getting mailbox quick stats for ${emailAddress}:`, error);
      return {
        success: false,
        error: {
          code: 'QUICK_STATS_ERROR',
          message: 'Erreur lors de la récupération des statistiques rapides',
          details: error
        }
      };
    }
  }
}