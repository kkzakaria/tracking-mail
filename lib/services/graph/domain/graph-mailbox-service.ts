/**
 * Service de gestion des boîtes email Microsoft Graph
 * Responsable des opérations sur les boîtes email et leurs messages
 */

import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';
import { GraphClientFactory } from '../core/graph-client-factory';
import { GraphRateLimitService } from '../core/graph-rate-limit-service';
import type {
  GraphOperationResult,
  GraphApiMessage,
  GraphRequestOptions
} from '@/lib/types/microsoft-graph';

/**
 * Statistiques de dossier email
 */
export interface MailFolderStats {
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
export interface MailboxStats {
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
 * Options pour les messages de boîte email
 */
export interface MailboxMessageOptions {
  limit?: number;
  unreadOnly?: boolean;
  folder?: string;
  startDate?: string;
  endDate?: string;
  importance?: 'low' | 'normal' | 'high';
  orderBy?: 'receivedDateTime' | 'subject' | 'from';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Options pour les statistiques de période
 */
export interface PeriodStatsOptions {
  startDate?: string;
  endDate?: string;
  includeChildFolders?: boolean;
  onlyUserFolders?: boolean;
}

/**
 * Résultat de synchronisation
 */
export interface SyncResult {
  messageCount: number;
  newMessages: number;
  updatedMessages: number;
  errors: number;
  duration: number;
}

/**
 * Service de gestion des boîtes email Microsoft Graph
 */
export class GraphMailboxService {
  private static instance: GraphMailboxService;
  private clientFactory: GraphClientFactory;
  private rateLimitService: GraphRateLimitService;

  private readonly defaultMessageFields = [
    'id',
    'subject',
    'from',
    'receivedDateTime',
    'bodyPreview',
    'isRead',
    'importance',
    'hasAttachments',
    'categories'
  ];

  private readonly defaultFolderFields = [
    'id',
    'displayName',
    'parentFolderId',
    'totalItemCount',
    'unreadItemCount',
    'childFolderCount',
    'isHidden',
    'wellKnownName'
  ];

  private constructor() {
    this.clientFactory = GraphClientFactory.getInstance();
    this.rateLimitService = GraphRateLimitService.getInstance();
  }

  /**
   * Obtenir l'instance unique du service
   */
  static getInstance(): GraphMailboxService {
    if (!GraphMailboxService.instance) {
      GraphMailboxService.instance = new GraphMailboxService();
    }
    return GraphMailboxService.instance;
  }

  /**
   * Synchroniser une boîte email spécifique
   */
  async syncMailbox(
    emailAddress: string,
    options?: { fullSync?: boolean; since?: Date }
  ): Promise<GraphOperationResult<SyncResult>> {
    const startTime = Date.now();
    const syncResult: SyncResult = {
      messageCount: 0,
      newMessages: 0,
      updatedMessages: 0,
      errors: 0,
      duration: 0
    };

    try {
      const clientResult = await this.clientFactory.createClientWithRetry();

      if (!clientResult.success || !clientResult.data) {
        return {
          success: false,
          error: clientResult.error || {
            code: 'NO_CLIENT',
            message: 'Impossible de créer le client Graph'
          }
        };
      }

      const client = clientResult.data;

      // Construire la requête avec les options de synchronisation
      let query = client
        .api(`/users/${emailAddress}/messages`)
        .select(this.defaultMessageFields.join(','))
        .top(100)
        .orderby('receivedDateTime desc');

      // Filtrer par date si nécessaire
      if (options?.since && !options.fullSync) {
        const sinceDate = options.since.toISOString();
        query = query.filter(`receivedDateTime ge ${sinceDate}`);
      }

      // Récupérer les messages
      const messages: GraphApiMessage[] = [];
      let nextLink: string | null = null;

      do {
        const response = await this.rateLimitService.executeWithRetry(
          () => (nextLink ? client.api(nextLink).get() : query.get()),
          { timeout: 20000, maxRetries: 2 }
        );

        messages.push(...(response.value || []));
        nextLink = response['@odata.nextLink'] || null;

        // Limiter le nombre de messages pour éviter les timeouts
        if (messages.length >= 500 && !options?.fullSync) {
          break;
        }
      } while (nextLink);

      syncResult.messageCount = messages.length;

      // Mettre à jour le statut de synchronisation dans Supabase
      await this.updateSyncStatus(emailAddress, 'syncing');

      // Traiter les messages (logique simplifiée - peut être étendue)
      // Dans une implémentation réelle, on comparerait avec les messages existants
      syncResult.newMessages = messages.length; // Simplification

      // Mettre à jour le statut final
      await this.updateSyncStatus(emailAddress, 'completed', {
        lastSyncAt: new Date().toISOString(),
        messageCount: syncResult.messageCount
      });

      syncResult.duration = Date.now() - startTime;

      return {
        success: true,
        data: syncResult
      };

    } catch (error) {
      console.error(`Error syncing mailbox ${emailAddress}:`, error);

      // Mettre à jour le statut d'erreur
      await this.updateSyncStatus(emailAddress, 'error', {
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      });

      syncResult.errors++;
      syncResult.duration = Date.now() - startTime;

      return this.handleError(error, 'SYNC_ERROR', 'Erreur lors de la synchronisation de la boîte email');
    }
  }

  /**
   * Obtenir les messages d'une boîte email
   */
  async getMailboxMessages(
    emailAddress: string,
    options?: MailboxMessageOptions
  ): Promise<GraphOperationResult<GraphApiMessage[]>> {
    try {
      const clientResult = await this.clientFactory.createClientWithRetry();

      if (!clientResult.success || !clientResult.data) {
        return {
          success: false,
          error: clientResult.error || {
            code: 'NO_CLIENT',
            message: 'Impossible de créer le client Graph'
          }
        };
      }

      const client = clientResult.data;

      // Construire le chemin de l'API
      const basePath = options?.folder
        ? `/users/${emailAddress}/mailFolders/${options.folder}/messages`
        : `/users/${emailAddress}/messages`;

      let query = client
        .api(basePath)
        .select(this.defaultMessageFields.join(','))
        .top(options?.limit || 50);

      // Appliquer les filtres
      const filters: string[] = [];

      if (options?.unreadOnly) {
        filters.push('isRead eq false');
      }

      if (options?.startDate) {
        filters.push(`receivedDateTime ge ${options.startDate}`);
      }

      if (options?.endDate) {
        filters.push(`receivedDateTime lt ${options.endDate}`);
      }

      if (options?.importance) {
        filters.push(`importance eq '${options.importance}'`);
      }

      if (filters.length > 0) {
        query = query.filter(filters.join(' and '));
      }

      // Appliquer le tri
      const orderBy = options?.orderBy || 'receivedDateTime';
      const orderDirection = options?.orderDirection || 'desc';
      query = query.orderby(`${orderBy} ${orderDirection}`);

      const response = await this.rateLimitService.executeWithRetry(
        () => query.get(),
        { timeout: 15000, maxRetries: 2 }
      );

      return {
        success: true,
        data: response.value || []
      };

    } catch (error) {
      console.error(`Error getting mailbox messages for ${emailAddress}:`, error);
      return this.handleMailboxError(error, emailAddress);
    }
  }

  /**
   * Obtenir tous les dossiers d'une boîte email
   */
  async getMailboxFolders(
    emailAddress: string,
    options?: { includeChildFolders?: boolean; includeHidden?: boolean }
  ): Promise<GraphOperationResult<MailFolderStats[]>> {
    try {
      const clientResult = await this.clientFactory.createClientWithRetry();

      if (!clientResult.success || !clientResult.data) {
        return {
          success: false,
          error: clientResult.error || {
            code: 'NO_CLIENT',
            message: 'Impossible de créer le client Graph'
          }
        };
      }

      const client = clientResult.data;

      // Récupérer les dossiers racine
      const rootFoldersResponse = await this.rateLimitService.executeWithRetry(
        () => client
          .api(`/users/${emailAddress}/mailFolders`)
          .select(this.defaultFolderFields.join(','))
          .get(),
        { timeout: 10000, maxRetries: 2 }
      );

      let allFolders: MailFolderStats[] = this.mapFoldersToStats(rootFoldersResponse.value);

      // Filtrer les dossiers cachés si nécessaire
      if (!options?.includeHidden) {
        allFolders = allFolders.filter(folder => !folder.isHidden);
      }

      // Récupérer les sous-dossiers si demandé
      if (options?.includeChildFolders) {
        const foldersWithChildren = allFolders.filter(f => f.childFolderCount > 0);

        for (const folder of foldersWithChildren) {
          try {
            const childFoldersResponse = await this.rateLimitService.executeWithRetry(
              () => client
                .api(`/users/${emailAddress}/mailFolders/${folder.id}/childFolders`)
                .select(this.defaultFolderFields.join(','))
                .get(),
              { timeout: 10000, maxRetries: 2 }
            );

            const childFolders = this.mapFoldersToStats(childFoldersResponse.value);

            // Filtrer les dossiers cachés des enfants
            if (!options?.includeHidden) {
              allFolders.push(...childFolders.filter(f => !f.isHidden));
            } else {
              allFolders.push(...childFolders);
            }

          } catch (error) {
            console.error(`Error fetching child folders for ${folder.displayName}:`, error);
          }
        }
      }

      return {
        success: true,
        data: allFolders
      };

    } catch (error) {
      console.error(`Error getting mailbox folders for ${emailAddress}:`, error);
      return this.handleError(error, 'GET_FOLDERS_ERROR', 'Erreur lors de la récupération des dossiers');
    }
  }

  /**
   * Obtenir les statistiques d'une boîte email pour une période
   */
  async getMailboxStatsForPeriod(
    emailAddress: string,
    options?: PeriodStatsOptions
  ): Promise<GraphOperationResult<MailboxStats>> {
    try {
      // Récupérer d'abord les dossiers
      const foldersResult = await this.getMailboxFolders(emailAddress, {
        includeChildFolders: options?.includeChildFolders ?? true,
        includeHidden: false
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

      // Filtrer les dossiers si nécessaire
      if (options?.onlyUserFolders) {
        folders = folders.filter(folder =>
          !folder.wellKnownName ||
          ['inbox', 'sentitems', 'drafts'].includes(folder.wellKnownName.toLowerCase())
        );
      }

      // Si une période est spécifiée, récupérer les compteurs pour cette période
      if (options?.startDate || options?.endDate) {
        const clientResult = await this.clientFactory.createClientWithRetry();

        if (!clientResult.success || !clientResult.data) {
          return {
            success: false,
            error: clientResult.error || {
              code: 'NO_CLIENT',
              message: 'Impossible de créer le client Graph'
            }
          };
        }

        const client = clientResult.data;
        const updatedFolders: MailFolderStats[] = [];

        for (const folder of folders) {
          try {
            const stats = await this.getFolderStatsForPeriod(
              client,
              emailAddress,
              folder.id,
              options
            );

            updatedFolders.push({
              ...folder,
              totalItemCount: stats.totalCount,
              unreadItemCount: stats.unreadCount
            });

          } catch (error) {
            console.error(`Error getting stats for folder ${folder.displayName}:`, error);
            updatedFolders.push(folder);
          }
        }

        folders = updatedFolders;
      }

      // Calculer les statistiques agrégées
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
      return this.handleError(error, 'GET_STATS_ERROR', 'Erreur lors de la récupération des statistiques');
    }
  }

  /**
   * Obtenir un aperçu rapide des statistiques
   */
  async getMailboxQuickStats(emailAddress: string): Promise<GraphOperationResult<MailboxStats>> {
    try {
      const foldersResult = await this.getMailboxFolders(emailAddress, {
        includeChildFolders: false,
        includeHidden: false
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

      const folders = foldersResult.data;
      const totalMessages = folders.reduce((sum, folder) => sum + folder.totalItemCount, 0);
      const unreadMessages = folders.reduce((sum, folder) => sum + folder.unreadItemCount, 0);

      return {
        success: true,
        data: {
          emailAddress,
          totalMessages,
          unreadMessages,
          folders
        }
      };

    } catch (error) {
      console.error(`Error getting quick stats for ${emailAddress}:`, error);
      return this.handleError(error, 'QUICK_STATS_ERROR', 'Erreur lors de la récupération des statistiques rapides');
    }
  }

  /**
   * Obtenir les statistiques d'un dossier pour une période
   */
  private async getFolderStatsForPeriod(
    client: any,
    emailAddress: string,
    folderId: string,
    options: PeriodStatsOptions
  ): Promise<{ totalCount: number; unreadCount: number }> {
    const dateFilters: string[] = [];

    if (options.startDate) {
      dateFilters.push(`receivedDateTime ge ${options.startDate}`);
    }
    if (options.endDate) {
      dateFilters.push(`receivedDateTime lt ${options.endDate}`);
    }

    const filterQuery = dateFilters.length > 0 ? dateFilters.join(' and ') : '';

    // Compter le total de messages
    const totalCountResponse = await this.rateLimitService.executeWithRetry(
      () => {
        const request = client.api(`/users/${emailAddress}/mailFolders/${folderId}/messages/$count`);
        if (filterQuery) {
          request.filter(filterQuery);
        }
        return request.get();
      },
      { timeout: 8000, maxRetries: 2 }
    );

    // Compter les messages non lus
    const unreadFilter = filterQuery
      ? `${filterQuery} and isRead eq false`
      : 'isRead eq false';

    const unreadCountResponse = await this.rateLimitService.executeWithRetry(
      () => client
        .api(`/users/${emailAddress}/mailFolders/${folderId}/messages/$count`)
        .filter(unreadFilter)
        .get(),
      { timeout: 8000, maxRetries: 2 }
    );

    return {
      totalCount: totalCountResponse || 0,
      unreadCount: unreadCountResponse || 0
    };
  }

  /**
   * Mapper les dossiers vers MailFolderStats
   */
  private mapFoldersToStats(folders: any[]): MailFolderStats[] {
    return folders.map(folder => ({
      id: folder.id,
      displayName: folder.displayName,
      parentFolderId: folder.parentFolderId,
      totalItemCount: folder.totalItemCount || 0,
      unreadItemCount: folder.unreadItemCount || 0,
      childFolderCount: folder.childFolderCount || 0,
      isHidden: folder.isHidden || false,
      wellKnownName: folder.wellKnownName
    }));
  }

  /**
   * Mettre à jour le statut de synchronisation dans Supabase
   */
  private async updateSyncStatus(
    emailAddress: string,
    status: 'syncing' | 'completed' | 'error',
    additionalData?: Record<string, any>
  ): Promise<void> {
    try {
      const supabase = await createSupabaseServerClient();

      const updateData: any = {
        sync_status: status,
        updated_at: new Date().toISOString()
      };

      if (status === 'completed') {
        updateData.last_sync_at = additionalData?.lastSyncAt || new Date().toISOString();
        updateData.sync_error = null;
      } else if (status === 'error') {
        updateData.sync_error = additionalData?.error || 'Erreur inconnue';
      }

      if (additionalData?.messageCount !== undefined) {
        updateData.message_count = additionalData.messageCount;
      }

      await supabase
        .from('mailboxes')
        .update(updateData)
        .eq('email_address', emailAddress);

    } catch (error) {
      console.error('Error updating sync status:', error);
    }
  }

  /**
   * Gérer les erreurs spécifiques aux boîtes email
   */
  private handleMailboxError(error: any, emailAddress: string): GraphOperationResult<any> {
    let errorCode = 'GET_MESSAGES_ERROR';
    let errorMessage = 'Erreur lors de la récupération des emails';

    if (error instanceof Error) {
      if (error.message === 'Request timeout') {
        errorCode = 'TIMEOUT_ERROR';
        errorMessage = `Timeout lors de la récupération des emails de ${emailAddress}`;
      } else if (this.rateLimitService.isAuthenticationError(error)) {
        errorCode = 'AUTH_ERROR';
        errorMessage = 'Erreur d\'authentification Microsoft Graph';
      } else if (this.rateLimitService.isPermissionError(error)) {
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