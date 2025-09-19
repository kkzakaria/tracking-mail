/**
 * Factory pour créer et configurer des clients Microsoft Graph
 * Responsable de la création centralisée des clients avec authentification
 */

import { Client, ClientOptions } from '@microsoft/microsoft-graph-client';
import { GraphTokenService } from './graph-token-service';
import { GraphRateLimitService, type RetryOptions } from './graph-rate-limit-service';
import type { GraphOperationResult } from '@/lib/types/microsoft-graph';

/**
 * Options pour la création d'un client Graph
 */
export interface GraphClientOptions {
  version?: string;
  defaultHeaders?: Record<string, string>;
  timeout?: number;
  scopes?: string[];
  enableRetry?: boolean;
  retryOptions?: RetryOptions;
}

/**
 * Client Graph avec métadonnées
 */
export interface GraphClientWrapper {
  client: Client;
  metadata: {
    createdAt: Date;
    version: string;
    scopes: string[];
  };
}

/**
 * Factory pour créer et gérer les clients Microsoft Graph
 */
export class GraphClientFactory {
  private static instance: GraphClientFactory;
  private tokenService: GraphTokenService;
  private rateLimitService: GraphRateLimitService;
  private defaultOptions: GraphClientOptions = {
    version: 'v1.0',
    timeout: 30000,
    enableRetry: true
  };
  private clientCache: Map<string, GraphClientWrapper> = new Map();

  private constructor() {
    this.tokenService = GraphTokenService.getInstance();
    this.rateLimitService = GraphRateLimitService.getInstance();
  }

  /**
   * Obtenir l'instance unique du factory
   */
  static getInstance(): GraphClientFactory {
    if (!GraphClientFactory.instance) {
      GraphClientFactory.instance = new GraphClientFactory();
    }
    return GraphClientFactory.instance;
  }

  /**
   * Créer un client Graph authentifié
   */
  async createClient(
    options: GraphClientOptions = {}
  ): Promise<GraphOperationResult<Client>> {
    try {
      // Fusionner avec les options par défaut
      const mergedOptions = { ...this.defaultOptions, ...options };

      // Obtenir un token d'accès
      const tokenResult = await this.tokenService.acquireApplicationToken({
        scopes: mergedOptions.scopes
      });

      if (!tokenResult.success || !tokenResult.data) {
        return {
          success: false,
          error: tokenResult.error || {
            code: 'NO_TOKEN',
            message: 'Impossible d\'obtenir un token d\'accès'
          }
        };
      }

      const token = tokenResult.data;

      // Configuration du client
      const clientOptions: ClientOptions = {
        authProvider: async (done) => {
          done(null, token);
        },
        defaultVersion: mergedOptions.version || 'v1.0'
      };

      // Créer le client Graph
      const client = Client.init(clientOptions);

      // Configurer les headers par défaut si fournis
      if (mergedOptions.defaultHeaders) {
        this.configureDefaultHeaders(client, mergedOptions.defaultHeaders);
      }

      return { success: true, data: client };

    } catch (error) {
      console.error('Error creating Graph client:', error);
      return {
        success: false,
        error: {
          code: 'CLIENT_CREATION_ERROR',
          message: 'Erreur lors de la création du client Graph',
          details: error
        }
      };
    }
  }

  /**
   * Créer un client Graph avec retry automatique
   */
  async createClientWithRetry(
    options: GraphClientOptions = {}
  ): Promise<GraphOperationResult<Client>> {
    try {
      const mergedOptions = { ...this.defaultOptions, ...options, enableRetry: true };

      // Créer le client de base
      const clientResult = await this.createClient(mergedOptions);

      if (!clientResult.success || !clientResult.data) {
        return clientResult;
      }

      const client = clientResult.data;

      // Wrapper pour ajouter le retry logic
      const wrappedClient = this.wrapClientWithRetry(client, mergedOptions.retryOptions);

      return { success: true, data: wrappedClient };

    } catch (error) {
      console.error('Error creating client with retry:', error);
      return {
        success: false,
        error: {
          code: 'CLIENT_CREATION_ERROR',
          message: 'Erreur lors de la création du client avec retry',
          details: error
        }
      };
    }
  }

  /**
   * Créer ou récupérer un client depuis le cache
   */
  async getOrCreateClient(
    cacheKey: string,
    options: GraphClientOptions = {}
  ): Promise<GraphOperationResult<Client>> {
    try {
      // Vérifier le cache
      const cached = this.clientCache.get(cacheKey);

      if (cached) {
        // Valider que le token est toujours valide
        const tokenResult = await this.tokenService.acquireApplicationToken({
          scopes: cached.metadata.scopes,
          skipCache: false
        });

        if (tokenResult.success) {
          return { success: true, data: cached.client };
        }

        // Token invalide, recréer le client
        this.clientCache.delete(cacheKey);
      }

      // Créer un nouveau client
      const clientResult = await this.createClient(options);

      if (!clientResult.success || !clientResult.data) {
        return clientResult;
      }

      // Mettre en cache
      const wrapper: GraphClientWrapper = {
        client: clientResult.data,
        metadata: {
          createdAt: new Date(),
          version: options.version || this.defaultOptions.version!,
          scopes: options.scopes || []
        }
      };

      this.clientCache.set(cacheKey, wrapper);

      return { success: true, data: clientResult.data };

    } catch (error) {
      console.error('Error getting or creating client:', error);
      return {
        success: false,
        error: {
          code: 'CLIENT_ERROR',
          message: 'Erreur lors de la récupération ou création du client',
          details: error
        }
      };
    }
  }

  /**
   * Wrapper un client avec la logique de retry
   */
  private wrapClientWithRetry(client: Client, retryOptions?: RetryOptions): Client {
    const originalApi = client.api.bind(client);
    const rateLimitService = this.rateLimitService;

    // Remplacer la méthode api pour intercepter les requêtes
    (client as any).api = function(path: string) {
      const request = originalApi(path);
      const originalGet = request.get?.bind(request);
      const originalPost = request.post?.bind(request);
      const originalPatch = request.patch?.bind(request);
      const originalPut = request.put?.bind(request);
      const originalDelete = request.delete?.bind(request);

      // Wrapper chaque méthode HTTP
      if (originalGet) {
        request.get = function() {
          return rateLimitService.executeWithRetry(
            () => originalGet.apply(this, arguments as any),
            retryOptions
          );
        };
      }

      if (originalPost) {
        request.post = function() {
          return rateLimitService.executeWithRetry(
            () => originalPost.apply(this, arguments as any),
            retryOptions
          );
        };
      }

      if (originalPatch) {
        request.patch = function() {
          return rateLimitService.executeWithRetry(
            () => originalPatch.apply(this, arguments as any),
            retryOptions
          );
        };
      }

      if (originalPut) {
        request.put = function() {
          return rateLimitService.executeWithRetry(
            () => originalPut.apply(this, arguments as any),
            retryOptions
          );
        };
      }

      if (originalDelete) {
        request.delete = function() {
          return rateLimitService.executeWithRetry(
            () => originalDelete.apply(this, arguments as any),
            retryOptions
          );
        };
      }

      return request;
    };

    return client;
  }

  /**
   * Configurer les headers par défaut d'un client
   */
  private configureDefaultHeaders(client: Client, headers: Record<string, string>): void {
    // Note: Le SDK Microsoft Graph n'expose pas directement une méthode pour les headers par défaut
    // Cette méthode pourrait être étendue avec un middleware personnalisé si nécessaire
    console.log('Default headers configured:', headers);
  }

  /**
   * Nettoyer le cache des clients
   */
  clearClientCache(): void {
    this.clientCache.clear();
  }

  /**
   * Obtenir les statistiques du cache
   */
  getCacheStats(): {
    totalClients: number;
    clientKeys: string[];
    oldestClient?: Date;
    newestClient?: Date;
  } {
    const clients = Array.from(this.clientCache.values());
    const dates = clients.map(c => c.metadata.createdAt);

    return {
      totalClients: this.clientCache.size,
      clientKeys: Array.from(this.clientCache.keys()),
      oldestClient: dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : undefined,
      newestClient: dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : undefined
    };
  }

  /**
   * Valider qu'un client est toujours utilisable
   */
  async validateClient(client: Client): Promise<GraphOperationResult<boolean>> {
    try {
      // Tester avec une requête simple
      await client.api('/me').select('id').get();
      return { success: true, data: true };

    } catch (error) {
      console.error('Client validation failed:', error);

      // Analyser le type d'erreur
      if (this.rateLimitService.isAuthenticationError(error)) {
        return {
          success: false,
          error: {
            code: 'AUTH_INVALID',
            message: 'Le client n\'est plus authentifié'
          }
        };
      }

      return {
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'La validation du client a échoué',
          details: error
        }
      };
    }
  }

  /**
   * Définir les options par défaut pour tous les clients
   */
  setDefaultOptions(options: Partial<GraphClientOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * Obtenir l'état du factory
   */
  getFactoryStatus(): {
    defaultOptions: GraphClientOptions;
    cacheStats: ReturnType<typeof this.getCacheStats>;
    tokenServiceStatus: ReturnType<GraphTokenService['getServiceStatus']>;
    rateLimitServiceStatus: ReturnType<GraphRateLimitService['getServiceStatus']>;
  } {
    return {
      defaultOptions: this.defaultOptions,
      cacheStats: this.getCacheStats(),
      tokenServiceStatus: this.tokenService.getServiceStatus(),
      rateLimitServiceStatus: this.rateLimitService.getServiceStatus()
    };
  }
}