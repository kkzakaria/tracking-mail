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
 * Statistiques de boîte email pour une période avec messages sans réponse
 */
export interface MailboxPeriodStats {
  emailAddress: string;
  totalMessages: number;
  unreadMessages: number;
  readMessages: number;
  unansweredMessages: number;
  answeredMessages: number;
  period: {
    startDate: string | null;
    endDate: string | null;
    description: string;
  };
  folders?: MailFolderStats[];
  sampleUnanswered?: UnansweredMessage[];
}

/**
 * Message sans réponse
 */
export interface UnansweredMessage {
  id: string;
  subject: string;
  from: {
    name?: string;
    address: string;
  };
  receivedDateTime: string;
  conversationId: string;
  importance: string;
  daysSinceReceived: number;
}

/**
 * Service de gestion des boîtes email Microsoft Graph
 */
export class GraphMailboxService {
  private static instance: GraphMailboxService;
  private clientFactory: GraphClientFactory;
  private rateLimitService: GraphRateLimitService;

  // Constantes pour PidTagMessageStatus
  private readonly MSGSTATUS_ANSWERED = 512; // 0x200 - Message a été répondu
  private readonly PID_TAG_MESSAGE_STATUS = 'Integer 0x0E17';

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
   * Obtenir les statistiques complètes d'une boîte email pour une période
   * Version avancée qui inclut les messages sans réponse
   */
  async getMailboxPeriodStats(
    emailAddress: string,
    options?: StatsQueryParams
  ): Promise<GraphOperationResult<MailboxPeriodStats>> {
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

      // Mode rapide ou complet
      if (options?.quick) {
        return this.getQuickMailboxStats(emailAddress, client, options);
      }

      // Calculer la période
      const period = this.calculatePeriod(options?.startDate, options?.endDate);

      // Récupérer les statistiques par dossier
      const folderStatsResult = await this.getFolderStatistics(
        client,
        emailAddress,
        options
      );

      if (!folderStatsResult.success) {
        return folderStatsResult;
      }

      const folders = folderStatsResult.data!;

      // Calculer les totaux
      const totalMessages = folders.reduce((sum, folder) => sum + folder.totalMessages, 0);
      const unreadMessages = folders.reduce((sum, folder) => sum + folder.unreadMessages, 0);
      let unansweredMessages = 0;
      let answeredMessages = 0;
      let sampleUnanswered: UnansweredMessage[] = [];

      // Calculer les messages sans réponse si demandé
      if (options?.includeUnanswered || options?.includeUnansweredSample) {
        const unansweredResult = await this.getUnansweredMessages(
          client,
          emailAddress,
          options
        );

        if (unansweredResult.success && unansweredResult.data) {
          unansweredMessages = unansweredResult.data.totalCount;
          answeredMessages = totalMessages - unansweredMessages;

          if (options?.includeUnansweredSample) {
            sampleUnanswered = unansweredResult.data.messages;
          }
        }
      }

      // Construire la réponse
      const stats: MailboxPeriodStats = {
        emailAddress,
        mailboxId: undefined, // Pas d'ID de boîte dans Graph API
        mailboxName: emailAddress,
        totalMessages,
        unreadMessages,
        readMessages: totalMessages - unreadMessages,
        unansweredMessages,
        answeredMessages,
        period,
        generatedAt: new Date().toISOString(),
        parameters: options
      };

      if (options?.includeFolders) {
        stats.folders = folders;
      }

      if (options?.includeUnansweredSample) {
        stats.sampleUnanswered = sampleUnanswered;
      }

      // Calculer le résumé si on a une période définie
      if (period.startDate && period.endDate) {
        const startDate = new Date(period.startDate);
        const endDate = new Date(period.endDate);
        const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

        stats.summary = {
          periodDays,
          responseRate: totalMessages > 0 ? (answeredMessages / totalMessages) * 100 : 0,
          readRate: totalMessages > 0 ? ((totalMessages - unreadMessages) / totalMessages) * 100 : 0
        };
      }

      return {
        success: true,
        data: stats
      };

    } catch (error) {
      console.error(`Error getting mailbox period stats for ${emailAddress}:`, error);
      return this.handleError(error, 'GET_PERIOD_STATS_ERROR', 'Erreur lors de la récupération des statistiques de période');
    }
  }

  /**
   * Obtenir les statistiques d'une boîte email pour une période (version simple)
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
   * Calculer la période d'analyse
   */
  private calculatePeriod(startDate?: string, endDate?: string) {
    return {
      startDate: startDate || null,
      endDate: endDate || null,
      description: this.buildPeriodDescription(startDate, endDate)
    };
  }

  /**
   * Construire la description de la période
   */
  private buildPeriodDescription(startDate?: string, endDate?: string): string {
    if (!startDate && !endDate) {
      return 'Toute la période';
    }
    if (startDate && endDate) {
      return `Du ${startDate} au ${endDate}`;
    }
    if (startDate) {
      return `Depuis le ${startDate}`;
    }
    return `Jusqu'au ${endDate}`;
  }

  /**
   * Mode rapide pour les statistiques de base
   */
  private async getQuickMailboxStats(
    emailAddress: string,
    client: any,
    options?: StatsQueryParams
  ): Promise<GraphOperationResult<MailboxPeriodStats>> {
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

      const period = this.calculatePeriod(options?.startDate, options?.endDate);

      const stats: MailboxPeriodStats = {
        emailAddress,
        mailboxName: emailAddress,
        totalMessages,
        unreadMessages,
        readMessages: totalMessages - unreadMessages,
        unansweredMessages: 0,
        answeredMessages: totalMessages,
        period,
        generatedAt: new Date().toISOString(),
        parameters: options
      };

      return { success: true, data: stats };

    } catch (error) {
      return this.handleError(error, 'QUICK_STATS_ERROR', 'Erreur lors des statistiques rapides');
    }
  }

  /**
   * Récupérer les statistiques par dossier
   */
  private async getFolderStatistics(
    client: any,
    emailAddress: string,
    options?: StatsQueryParams
  ): Promise<GraphOperationResult<FolderStats[]>> {
    try {
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

      // Filtrer les dossiers utilisateur seulement si demandé
      if (options?.onlyUserFolders) {
        folders = folders.filter(folder =>
          !folder.wellKnownName ||
          ['inbox', 'sentitems', 'drafts'].includes(folder.wellKnownName.toLowerCase())
        );
      }

      const folderStats: FolderStats[] = [];

      for (const folder of folders) {
        let totalMessages = folder.totalItemCount;
        let unreadMessages = folder.unreadItemCount;
        let unansweredMessages = 0;

        // Si une période est spécifiée, recalculer les compteurs
        if (options?.startDate || options?.endDate) {
          const stats = await this.getFolderStatsForPeriod(
            client,
            emailAddress,
            folder.id,
            { startDate: options?.startDate, endDate: options?.endDate }
          );
          totalMessages = stats.totalCount;
          unreadMessages = stats.unreadCount;
        }

        // Calculer les messages sans réponse si demandé
        if (options?.includeUnanswered) {
          unansweredMessages = await this.countUnansweredMessagesInFolder(
            client,
            emailAddress,
            folder.id,
            options
          );
        }

        folderStats.push({
          id: folder.id,
          displayName: folder.displayName,
          totalMessages,
          unreadMessages,
          unansweredMessages,
          wellKnownName: folder.wellKnownName
        });
      }

      return { success: true, data: folderStats };

    } catch (error) {
      return this.handleError(error, 'FOLDER_STATS_ERROR', 'Erreur lors des statistiques par dossier');
    }
  }

  /**
   * Récupérer les messages sans réponse
   */
  private async getUnansweredMessages(
    client: any,
    emailAddress: string,
    options?: StatsQueryParams
  ): Promise<GraphOperationResult<{ totalCount: number; messages: UnansweredMessage[] }>> {
    try {
      // Construire les filtres de date
      const dateFilters: string[] = [];
      if (options?.startDate) {
        dateFilters.push(`receivedDateTime ge ${options.startDate}`);
      }
      if (options?.endDate) {
        dateFilters.push(`receivedDateTime lt ${options.endDate}`);
      }

      // Essayer d'abord avec PidTagMessageStatus
      try {
        return await this.getUnansweredMessagesWithPidTag(
          client,
          emailAddress,
          dateFilters,
          options?.includeUnansweredSample ?? false
        );
      } catch (pidError) {
        console.warn('PidTagMessageStatus method failed, trying alternative:', pidError);

        // Méthode alternative basée sur les conversations
        return await this.getUnansweredMessagesAlternative(
          client,
          emailAddress,
          dateFilters,
          options?.includeUnansweredSample ?? false
        );
      }

    } catch (error) {
      return this.handleError(error, 'UNANSWERED_ERROR', 'Erreur lors de la récupération des messages sans réponse');
    }
  }

  /**
   * Méthode utilisant PidTagMessageStatus pour détecter les messages sans réponse
   */
  private async getUnansweredMessagesWithPidTag(
    client: any,
    emailAddress: string,
    dateFilters: string[],
    includeSample: boolean
  ): Promise<GraphOperationResult<{ totalCount: number; messages: UnansweredMessage[] }>> {
    // Filtres pour les messages sans réponse (bit 512 non défini dans PidTagMessageStatus)
    const filters = [...dateFilters];

    // Ajouter le filtre pour PidTagMessageStatus
    filters.push(`singleValueExtendedProperties/any(ep: ep/id eq '${PID_TAG_MESSAGE_STATUS}' and not(ep/value ge '${MSGSTATUS_ANSWERED}'))`);

    const filterQuery = filters.join(' and ');

    // Compter d'abord
    const countResponse = await this.rateLimitService.executeWithRetry(
      () => client
        .api(`/users/${emailAddress}/messages/$count`)
        .filter(filterQuery)
        .get(),
      { timeout: 10000, maxRetries: 2 }
    );

    const totalCount = countResponse || 0;
    let messages: UnansweredMessage[] = [];

    // Récupérer un échantillon si demandé
    if (includeSample && totalCount > 0) {
      const selectFields = [
        'id', 'subject', 'from', 'receivedDateTime',
        'conversationId', 'importance'
      ];

      const messagesResponse = await this.rateLimitService.executeWithRetry(
        () => client
          .api(`/users/${emailAddress}/messages`)
          .filter(filterQuery)
          .select(selectFields.join(','))
          .top(20)
          .orderby('receivedDateTime desc')
          .get(),
        { timeout: 15000, maxRetries: 2 }
      );

      messages = (messagesResponse?.value || []).map((msg: any) => ({
        id: msg.id,
        subject: msg.subject || '(Pas de sujet)',
        from: {
          name: msg.from?.emailAddress?.name,
          address: msg.from?.emailAddress?.address || 'Inconnu'
        },
        receivedDateTime: msg.receivedDateTime,
        conversationId: msg.conversationId,
        importance: msg.importance || 'normal',
        daysSinceReceived: Math.floor((Date.now() - new Date(msg.receivedDateTime).getTime()) / (1000 * 60 * 60 * 24))
      }));
    }

    return {
      success: true,
      data: { totalCount, messages }
    };
  }

  /**
   * Méthode alternative basée sur l'analyse des conversations
   */
  private async getUnansweredMessagesAlternative(
    client: any,
    emailAddress: string,
    dateFilters: string[],
    includeSample: boolean
  ): Promise<GraphOperationResult<{ totalCount: number; messages: UnansweredMessage[] }>> {
    // Cette méthode est plus complexe et approximative
    // Elle analyse les conversations pour détecter les messages entrants sans réponse sortante

    const filters = [...dateFilters];
    // Filtrer les messages entrants uniquement (pas dans les éléments envoyés)
    filters.push("isDraft eq false");

    const filterQuery = filters.length > 0 ? filters.join(' and ') : '';

    // Pour la version alternative, nous utilisons une approche simplifiée
    // qui compte les messages non lus comme approximation des messages sans réponse
    const unreadFilter = filterQuery
      ? `${filterQuery} and isRead eq false`
      : 'isRead eq false';

    const countResponse = await this.rateLimitService.executeWithRetry(
      () => client
        .api(`/users/${emailAddress}/messages/$count`)
        .filter(unreadFilter)
        .get(),
      { timeout: 10000, maxRetries: 2 }
    );

    const totalCount = countResponse || 0;
    let messages: UnansweredMessage[] = [];

    if (includeSample && totalCount > 0) {
      const selectFields = [
        'id', 'subject', 'from', 'receivedDateTime',
        'conversationId', 'importance'
      ];

      const messagesResponse = await this.rateLimitService.executeWithRetry(
        () => client
          .api(`/users/${emailAddress}/messages`)
          .filter(unreadFilter)
          .select(selectFields.join(','))
          .top(20)
          .orderby('receivedDateTime desc')
          .get(),
        { timeout: 15000, maxRetries: 2 }
      );

      messages = (messagesResponse?.value || []).map((msg: any) => ({
        id: msg.id,
        subject: msg.subject || '(Pas de sujet)',
        from: {
          name: msg.from?.emailAddress?.name,
          address: msg.from?.emailAddress?.address || 'Inconnu'
        },
        receivedDateTime: msg.receivedDateTime,
        conversationId: msg.conversationId,
        importance: msg.importance || 'normal',
        daysSinceReceived: Math.floor((Date.now() - new Date(msg.receivedDateTime).getTime()) / (1000 * 60 * 60 * 24))
      }));
    }

    return {
      success: true,
      data: { totalCount, messages }
    };
  }

  /**
   * Compter les messages sans réponse dans un dossier
   */
  private async countUnansweredMessagesInFolder(
    client: any,
    emailAddress: string,
    folderId: string,
    options?: StatsQueryParams
  ): Promise<number> {
    try {
      const dateFilters: string[] = [];
      if (options?.startDate) {
        dateFilters.push(`receivedDateTime ge ${options.startDate}`);
      }
      if (options?.endDate) {
        dateFilters.push(`receivedDateTime lt ${options.endDate}`);
      }

      // Essayer avec PidTagMessageStatus
      try {
        const filters = [...dateFilters];
        filters.push(`singleValueExtendedProperties/any(ep: ep/id eq '${PID_TAG_MESSAGE_STATUS}' and not(ep/value ge '${MSGSTATUS_ANSWERED}'))`);

        const filterQuery = filters.join(' and ');

        const count = await this.rateLimitService.executeWithRetry(
          () => client
            .api(`/users/${emailAddress}/mailFolders/${folderId}/messages/$count`)
            .filter(filterQuery)
            .get(),
          { timeout: 8000, maxRetries: 2 }
        );

        return count || 0;
      } catch (error) {
        // Méthode de fallback: approximation avec les messages non lus
        const unreadFilter = dateFilters.length > 0
          ? `${dateFilters.join(' and ')} and isRead eq false`
          : 'isRead eq false';

        const count = await this.rateLimitService.executeWithRetry(
          () => client
            .api(`/users/${emailAddress}/mailFolders/${folderId}/messages/$count`)
            .filter(unreadFilter)
            .get(),
          { timeout: 8000, maxRetries: 2 }
        );

        return count || 0;
      }
    } catch (error) {
      console.error(`Error counting unanswered messages in folder ${folderId}:`, error);
      return 0;
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
   * Obtenir les statistiques complètes d'une boîte email pour une période
   * (Intégré depuis MailboxStatsService)
   */
  async getMailboxPeriodStats(
    emailAddress: string,
    options?: {
      startDate?: string;
      endDate?: string;
      includeFolders?: boolean;
      includeUnanswered?: boolean;
      includeUnansweredSample?: boolean;
      onlyUserFolders?: boolean;
    }
  ): Promise<GraphOperationResult<MailboxPeriodStats>> {
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

      // Récupérer les statistiques de base
      const baseStats = await this.getBasicStatsForPeriod(client, emailAddress, options || {});
      if (!baseStats.success || !baseStats.data) {
        return baseStats as GraphOperationResult<MailboxPeriodStats>;
      }

      let stats: MailboxPeriodStats = {
        ...baseStats.data,
        unansweredMessages: 0,
        answeredMessages: baseStats.data.totalMessages,
        period: {
          startDate: options?.startDate || null,
          endDate: options?.endDate || null,
          description: this.getPeriodDescription(options?.startDate, options?.endDate)
        }
      };

      // Ajouter les statistiques des messages sans réponse si demandé
      if (options?.includeUnanswered !== false) {
        const unansweredResult = await this.getUnansweredMessages(
          client,
          emailAddress,
          options || {}
        );

        if (unansweredResult.success && unansweredResult.data) {
          stats.unansweredMessages = unansweredResult.data.count;
          stats.answeredMessages = stats.totalMessages - stats.unansweredMessages;

          if (options?.includeUnansweredSample && unansweredResult.data.messages) {
            stats.sampleUnanswered = unansweredResult.data.messages;
          }
        }
      }

      return { success: true, data: stats };

    } catch (error) {
      console.error('Error getting mailbox period stats:', error);
      return this.handleError(error, 'PERIOD_STATS_ERROR', 'Erreur lors de la récupération des statistiques de période');
    }
  }

  /**
   * Obtenir les statistiques de base pour une période
   */
  private async getBasicStatsForPeriod(
    client: any,
    emailAddress: string,
    options: {
      startDate?: string;
      endDate?: string;
      includeFolders?: boolean;
      onlyUserFolders?: boolean;
    }
  ): Promise<GraphOperationResult<Omit<MailboxPeriodStats, 'unansweredMessages' | 'answeredMessages' | 'period'>>> {
    try {
      // Construire les filtres de date
      const dateFilters: string[] = [];
      if (options.startDate) {
        dateFilters.push(`receivedDateTime ge ${options.startDate}`);
      }
      if (options.endDate) {
        dateFilters.push(`receivedDateTime lt ${options.endDate}`);
      }
      const dateFilter = dateFilters.length > 0 ? dateFilters.join(' and ') : undefined;

      // Récupérer les dossiers et leurs statistiques
      const foldersResponse = await this.rateLimitService.executeWithRetry(
        () => client
          .api(`/users/${emailAddress}/mailFolders`)
          .select(this.defaultFolderFields.join(','))
          .get(),
        { timeout: 10000, maxRetries: 2 }
      );

      const folders: MailFolderStats[] = [];
      let totalMessages = 0;
      let unreadMessages = 0;

      // Si des dates sont spécifiées, compter les messages pour la période
      if (dateFilter) {
        for (const folder of foldersResponse.value) {
          // Ignorer les dossiers système si demandé
          if (options.onlyUserFolders && this.isSystemFolder(folder)) {
            continue;
          }

          // Compter les messages totaux pour la période
          const totalCount = await this.countMessagesInFolder(
            client,
            emailAddress,
            folder.id,
            dateFilter
          );

          // Compter les messages non lus pour la période
          const unreadFilter = `${dateFilter} and isRead eq false`;
          const unreadCount = await this.countMessagesInFolder(
            client,
            emailAddress,
            folder.id,
            unreadFilter
          );

          const folderStats: MailFolderStats = {
            id: folder.id,
            displayName: folder.displayName,
            parentFolderId: folder.parentFolderId,
            totalItemCount: totalCount,
            unreadItemCount: unreadCount,
            childFolderCount: folder.childFolderCount || 0,
            isHidden: folder.isHidden || false,
            wellKnownName: folder.wellKnownName
          };

          folders.push(folderStats);
          totalMessages += totalCount;
          unreadMessages += unreadCount;
        }
      } else {
        // Sans filtre de date, utiliser les compteurs natifs des dossiers
        for (const folder of foldersResponse.value) {
          if (options.onlyUserFolders && this.isSystemFolder(folder)) {
            continue;
          }

          const folderStats: MailFolderStats = {
            id: folder.id,
            displayName: folder.displayName,
            parentFolderId: folder.parentFolderId,
            totalItemCount: folder.totalItemCount || 0,
            unreadItemCount: folder.unreadItemCount || 0,
            childFolderCount: folder.childFolderCount || 0,
            isHidden: folder.isHidden || false,
            wellKnownName: folder.wellKnownName
          };

          folders.push(folderStats);
          totalMessages += folderStats.totalItemCount;
          unreadMessages += folderStats.unreadItemCount;
        }
      }

      return {
        success: true,
        data: {
          emailAddress,
          totalMessages,
          unreadMessages,
          readMessages: totalMessages - unreadMessages,
          folders: options.includeFolders ? folders : undefined
        }
      };

    } catch (error) {
      console.error('Error getting basic stats for period:', error);
      return this.handleError(error, 'BASIC_STATS_ERROR', 'Erreur lors de la récupération des statistiques de base');
    }
  }

  /**
   * Obtenir les messages sans réponse en utilisant PidTagMessageStatus
   */
  private async getUnansweredMessages(
    client: any,
    emailAddress: string,
    options: {
      startDate?: string;
      endDate?: string;
      includeUnansweredSample?: boolean;
    }
  ): Promise<GraphOperationResult<{ count: number; messages?: UnansweredMessage[] }>> {
    try {
      // Construire le filtre pour les messages non répondus
      const filters: string[] = [
        `singleValueExtendedProperties/any(ep:ep/id eq '${this.PID_TAG_MESSAGE_STATUS}' and cast(ep/value, Edm.Int32) ne ${this.MSGSTATUS_ANSWERED})`
      ];

      // Ajouter les filtres de date
      if (options.startDate) {
        filters.push(`receivedDateTime ge ${options.startDate}`);
      }
      if (options.endDate) {
        filters.push(`receivedDateTime lt ${options.endDate}`);
      }

      const filterQuery = filters.join(' and ');

      // Compter le total des messages sans réponse
      let totalCount = 0;
      try {
        const countResponse = await this.rateLimitService.executeWithRetry(
          () => client
            .api(`/users/${emailAddress}/messages/$count`)
            .filter(filterQuery)
            .get(),
          { timeout: 10000, maxRetries: 2 }
        );
        totalCount = countResponse || 0;
      } catch (error) {
        console.warn('Count API failed, will use collection count:', error);
      }

      // Si on doit récupérer un échantillon
      let messages: UnansweredMessage[] = [];
      if (options.includeUnansweredSample) {
        const messagesResponse = await this.rateLimitService.executeWithRetry(
          () => client
            .api(`/users/${emailAddress}/messages`)
            .filter(filterQuery)
            .select('id,subject,from,receivedDateTime,importance,conversationId')
            .top(20)
            .orderby('receivedDateTime desc')
            .expand(`singleValueExtendedProperties($filter=id eq '${this.PID_TAG_MESSAGE_STATUS}')`)
            .get(),
          { timeout: 15000, maxRetries: 2 }
        );

        // Filtrage côté client pour vérifier les valeurs bitwise
        const verifiedMessages = (messagesResponse.value || []).filter((msg: any) => {
          const extProp = msg.singleValueExtendedProperties?.find(
            (prop: any) => prop.id === this.PID_TAG_MESSAGE_STATUS
          );

          if (!extProp) return true; // Si pas de propriété, considérer comme non répondu

          const statusValue = parseInt(extProp.value);
          // Vérifier si le bit MSGSTATUS_ANSWERED (0x200) n'est pas défini
          return (statusValue & this.MSGSTATUS_ANSWERED) === 0;
        });

        messages = verifiedMessages.map((msg: any) => ({
          id: msg.id,
          subject: msg.subject,
          from: {
            name: msg.from?.emailAddress?.name,
            address: msg.from?.emailAddress?.address || 'unknown'
          },
          receivedDateTime: msg.receivedDateTime,
          conversationId: msg.conversationId,
          importance: msg.importance || 'normal',
          daysSinceReceived: this.calculateDaysSince(msg.receivedDateTime)
        }));

        // Si le count a échoué, utiliser la longueur des messages vérifiés
        if (totalCount === 0) {
          totalCount = verifiedMessages.length;
        }
      }

      return {
        success: true,
        data: {
          count: totalCount,
          messages: messages.length > 0 ? messages : undefined
        }
      };

    } catch (error) {
      console.error('Error getting unanswered messages:', error);

      // Si l'erreur est liée aux propriétés étendues, essayer la méthode alternative
      if (error instanceof Error && error.message.includes('singleValueExtendedProperties')) {
        return this.getUnansweredMessagesAlternative(client, emailAddress, options);
      }

      return this.handleError(error, 'UNANSWERED_ERROR', 'Erreur lors de la récupération des messages sans réponse');
    }
  }

  /**
   * Méthode alternative pour les messages sans réponse (via conversationId)
   */
  private async getUnansweredMessagesAlternative(
    client: any,
    emailAddress: string,
    options: {
      startDate?: string;
      endDate?: string;
      includeUnansweredSample?: boolean;
    }
  ): Promise<GraphOperationResult<{ count: number; messages?: UnansweredMessage[] }>> {
    try {
      // Construire les filtres de date
      const dateFilters: string[] = [];
      if (options.startDate) {
        dateFilters.push(`receivedDateTime ge ${options.startDate}`);
      }
      if (options.endDate) {
        dateFilters.push(`receivedDateTime lt ${options.endDate}`);
      }
      const dateFilter = dateFilters.length > 0 ? dateFilters.join(' and ') : undefined;

      // Récupérer les messages de la boîte de réception
      let inboxQuery = client
        .api(`/users/${emailAddress}/mailFolders/inbox/messages`)
        .select('id,subject,from,receivedDateTime,conversationId,importance')
        .top(100)
        .orderby('receivedDateTime desc');

      if (dateFilter) {
        inboxQuery = inboxQuery.filter(dateFilter);
      }

      const inboxMessages = await this.rateLimitService.executeWithRetry(
        () => inboxQuery.get(),
        { timeout: 15000, maxRetries: 2 }
      );

      // Récupérer les messages envoyés pour identifier les conversations avec réponse
      let sentQuery = client
        .api(`/users/${emailAddress}/mailFolders/sentitems/messages`)
        .select('conversationId')
        .top(100);

      if (dateFilter) {
        sentQuery = sentQuery.filter(dateFilter);
      }

      const sentMessages = await this.rateLimitService.executeWithRetry(
        () => sentQuery.get(),
        { timeout: 15000, maxRetries: 2 }
      );

      // Créer un Set des conversationId qui ont eu des réponses
      const repliedConversations = new Set(
        sentMessages.value?.map((msg: any) => msg.conversationId).filter(Boolean) || []
      );

      // Filtrer les messages sans réponse
      const unansweredMessages = (inboxMessages.value || []).filter(
        (msg: any) => !repliedConversations.has(msg.conversationId)
      );

      const messages: UnansweredMessage[] = options.includeUnansweredSample
        ? unansweredMessages.slice(0, 20).map((msg: any) => ({
            id: msg.id,
            subject: msg.subject,
            from: {
              name: msg.from?.emailAddress?.name,
              address: msg.from?.emailAddress?.address || 'unknown'
            },
            receivedDateTime: msg.receivedDateTime,
            conversationId: msg.conversationId,
            importance: msg.importance || 'normal',
            daysSinceReceived: this.calculateDaysSince(msg.receivedDateTime)
          }))
        : [];

      return {
        success: true,
        data: {
          count: unansweredMessages.length,
          messages: messages.length > 0 ? messages : undefined
        }
      };

    } catch (error) {
      console.error('Error in alternative unanswered method:', error);
      return this.handleError(error, 'UNANSWERED_ALT_ERROR', 'Erreur lors de la récupération des messages sans réponse (méthode alternative)');
    }
  }

  /**
   * Compter les messages dans un dossier avec un filtre
   */
  private async countMessagesInFolder(
    client: any,
    emailAddress: string,
    folderId: string,
    filter?: string
  ): Promise<number> {
    try {
      let query = client.api(`/users/${emailAddress}/mailFolders/${folderId}/messages/$count`);

      if (filter) {
        query = query.filter(filter);
      }

      const count = await this.rateLimitService.executeWithRetry(
        () => query.get(),
        { timeout: 8000, maxRetries: 2 }
      );

      return count || 0;

    } catch (error) {
      console.error(`Error counting messages in folder ${folderId}:`, error);
      return 0;
    }
  }

  /**
   * Vérifier si un dossier est un dossier système
   */
  private isSystemFolder(folder: any): boolean {
    const systemFolders = [
      'deleteditems', 'junkemail', 'outbox', 'recoverableitemsdeletions',
      'scheduled', 'searchfolders', 'serverfailures', 'syncissues'
    ];

    return folder.wellKnownName &&
           systemFolders.includes(folder.wellKnownName.toLowerCase());
  }

  /**
   * Calculer le nombre de jours depuis une date
   */
  private calculateDaysSince(dateString: string): number {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Générer une description lisible de la période
   */
  private getPeriodDescription(startDate?: string, endDate?: string): string {
    if (!startDate && !endDate) {
      return 'Toutes les périodes';
    }

    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    if (startDate && endDate) {
      return `Du ${formatDate(startDate)} au ${formatDate(endDate)}`;
    } else if (startDate) {
      return `À partir du ${formatDate(startDate)}`;
    } else if (endDate) {
      return `Jusqu'au ${formatDate(endDate)}`;
    } else {
      return 'Toutes les périodes';
    }
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

// Exports are already handled by the class and interface declarations above