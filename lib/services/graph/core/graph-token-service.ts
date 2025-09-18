/**
 * Service de gestion des tokens Microsoft Graph
 * Responsable de l'acquisition, le renouvellement et la mise en cache des tokens
 */

import { ConfidentialClientApplication, ClientCredentialRequest, AuthenticationResult } from '@azure/msal-node';
import { GraphConfigService, type AdminGraphConfig } from './graph-config-service';
import type { GraphOperationResult } from '@/lib/types/microsoft-graph';

/**
 * Information sur un token en cache
 */
interface TokenCacheEntry {
  token: string;
  expiresAt: number;
  scopes: string[];
}

/**
 * Options pour l'acquisition de token
 */
interface TokenAcquisitionOptions {
  scopes?: string[];
  forceRefresh?: boolean;
  skipCache?: boolean;
}

/**
 * Service de gestion des tokens d'authentification Microsoft Graph
 */
export class GraphTokenService {
  private static instance: GraphTokenService;
  private confidentialClient: ConfidentialClientApplication | null = null;
  private tokenCache: Map<string, TokenCacheEntry> = new Map();
  private configService: GraphConfigService;

  private constructor() {
    this.configService = GraphConfigService.getInstance();
  }

  /**
   * Obtenir l'instance unique du service
   */
  static getInstance(): GraphTokenService {
    if (!GraphTokenService.instance) {
      GraphTokenService.instance = new GraphTokenService();
    }
    return GraphTokenService.instance;
  }

  /**
   * Initialiser le service avec la configuration
   */
  async initialize(): Promise<GraphOperationResult<boolean>> {
    try {
      const config = await this.configService.getStoredConfig();

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

      this.confidentialClient = new ConfidentialClientApplication({
        auth: {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          authority: `https://login.microsoftonline.com/${config.tenantId}`
        },
        cache: {
          cachePlugin: undefined // Peut être étendu avec un plugin de cache personnalisé
        }
      });

      return { success: true, data: true };

    } catch (error) {
      console.error('Error initializing GraphTokenService:', error);
      return {
        success: false,
        error: {
          code: 'INIT_ERROR',
          message: 'Erreur lors de l\'initialisation du service de tokens',
          details: error
        }
      };
    }
  }

  /**
   * Acquérir un token d'accès application
   */
  async acquireApplicationToken(
    options: TokenAcquisitionOptions = {}
  ): Promise<GraphOperationResult<string>> {
    try {
      // Vérifier l'initialisation
      if (!this.confidentialClient) {
        const initResult = await this.initialize();
        if (!initResult.success || !this.confidentialClient) {
          return {
            success: false,
            error: {
              code: 'NOT_INITIALIZED',
              message: 'Service de tokens non initialisé'
            }
          };
        }
      }

      const scopes = options.scopes || ['https://graph.microsoft.com/.default'];
      const cacheKey = this.getCacheKey(scopes);

      // Vérifier le cache sauf si explicitement désactivé
      if (!options.skipCache && !options.forceRefresh) {
        const cachedToken = this.getFromCache(cacheKey);
        if (cachedToken) {
          return { success: true, data: cachedToken };
        }
      }

      // Acquérir un nouveau token
      const clientCredentialRequest: ClientCredentialRequest = {
        scopes,
        skipCache: options.forceRefresh
      };

      const response = await this.confidentialClient.acquireTokenByClientCredential(clientCredentialRequest);

      if (!response?.accessToken) {
        return {
          success: false,
          error: {
            code: 'TOKEN_ACQUISITION_FAILED',
            message: 'Impossible d\'obtenir un token d\'accès'
          }
        };
      }

      // Mettre en cache le token
      this.cacheToken(cacheKey, response);

      return { success: true, data: response.accessToken };

    } catch (error) {
      console.error('Error acquiring application token:', error);
      return {
        success: false,
        error: {
          code: 'TOKEN_ERROR',
          message: 'Erreur lors de l\'acquisition du token',
          details: error
        }
      };
    }
  }

  /**
   * Renouveler un token expiré ou sur le point d'expirer
   */
  async refreshToken(scopes?: string[]): Promise<GraphOperationResult<string>> {
    return this.acquireApplicationToken({
      scopes,
      forceRefresh: true,
      skipCache: true
    });
  }

  /**
   * Valider un token
   */
  async validateToken(token: string): Promise<GraphOperationResult<boolean>> {
    try {
      // Décoder le token pour vérifier l'expiration
      const payload = this.decodeToken(token);

      if (!payload) {
        return {
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Token invalide ou mal formé'
          }
        };
      }

      const now = Math.floor(Date.now() / 1000);
      const exp = payload.exp as number;

      if (exp <= now) {
        return {
          success: false,
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Le token a expiré'
          }
        };
      }

      // Token valide si l'expiration est dans le futur
      return { success: true, data: true };

    } catch (error) {
      console.error('Error validating token:', error);
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Erreur lors de la validation du token',
          details: error
        }
      };
    }
  }

  /**
   * Obtenir un token depuis le cache
   */
  private getFromCache(key: string): string | null {
    const entry = this.tokenCache.get(key);

    if (!entry) {
      return null;
    }

    // Vérifier l'expiration avec une marge de 5 minutes
    const now = Date.now();
    const expirationBuffer = 5 * 60 * 1000; // 5 minutes

    if (entry.expiresAt <= now + expirationBuffer) {
      // Token expiré ou sur le point d'expirer
      this.tokenCache.delete(key);
      return null;
    }

    return entry.token;
  }

  /**
   * Mettre en cache un token
   */
  private cacheToken(key: string, authResult: AuthenticationResult): void {
    if (!authResult.accessToken || !authResult.expiresOn) {
      return;
    }

    const entry: TokenCacheEntry = {
      token: authResult.accessToken,
      expiresAt: authResult.expiresOn.getTime(),
      scopes: authResult.scopes || []
    };

    this.tokenCache.set(key, entry);
  }

  /**
   * Générer une clé de cache pour les scopes
   */
  private getCacheKey(scopes: string[]): string {
    return scopes.sort().join('|');
  }

  /**
   * Décoder un token JWT sans validation
   */
  private decodeToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = parts[1];
      const decoded = Buffer.from(payload, 'base64').toString('utf-8');
      return JSON.parse(decoded);

    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }

  /**
   * Nettoyer le cache des tokens
   */
  clearTokenCache(): void {
    this.tokenCache.clear();
  }

  /**
   * Nettoyer les tokens expirés du cache
   */
  cleanupExpiredTokens(): void {
    const now = Date.now();

    for (const [key, entry] of this.tokenCache.entries()) {
      if (entry.expiresAt <= now) {
        this.tokenCache.delete(key);
      }
    }
  }

  /**
   * Obtenir les statistiques du cache
   */
  getCacheStats(): {
    totalTokens: number;
    validTokens: number;
    expiredTokens: number;
  } {
    const now = Date.now();
    let validTokens = 0;
    let expiredTokens = 0;

    for (const entry of this.tokenCache.values()) {
      if (entry.expiresAt > now) {
        validTokens++;
      } else {
        expiredTokens++;
      }
    }

    return {
      totalTokens: this.tokenCache.size,
      validTokens,
      expiredTokens
    };
  }

  /**
   * Obtenir l'état du service
   */
  getServiceStatus(): {
    isInitialized: boolean;
    hasCachedTokens: boolean;
    cacheStats: ReturnType<typeof this.getCacheStats>;
  } {
    return {
      isInitialized: !!this.confidentialClient,
      hasCachedTokens: this.tokenCache.size > 0,
      cacheStats: this.getCacheStats()
    };
  }
}