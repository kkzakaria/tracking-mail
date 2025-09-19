/**
 * Service de gestion du rate limiting et retry logic
 * Responsable de l'exécution avec retry, gestion des erreurs et rate limiting
 */

import type { GraphOperationResult, RateLimitInfo, GraphRequestOptions } from '@/lib/types/microsoft-graph';

/**
 * Options de retry étendues
 */
export interface RetryOptions extends GraphRequestOptions {
  maxRetries?: number;
  timeout?: number;
  backoffMultiplier?: number;
  maxBackoffMs?: number;
  shouldRetry?: (error: any, attempt: number) => boolean;
}

/**
 * Informations sur une tentative de retry
 */
interface RetryAttempt {
  attempt: number;
  error: Error;
  nextRetryIn: number;
  willRetry: boolean;
}

/**
 * Statistiques de rate limiting
 */
interface RateLimitStats {
  totalRequests: number;
  rateLimitedRequests: number;
  retriedRequests: number;
  failedRequests: number;
  averageRetryCount: number;
}

/**
 * Service de gestion du rate limiting et des retries
 */
export class GraphRateLimitService {
  private static instance: GraphRateLimitService;
  private rateLimitCache: Map<string, RateLimitInfo> = new Map();
  private requestStats: RateLimitStats = {
    totalRequests: 0,
    rateLimitedRequests: 0,
    retriedRequests: 0,
    failedRequests: 0,
    averageRetryCount: 0
  };
  private retryCallbacks: Array<(attempt: RetryAttempt) => void> = [];

  private constructor() {}

  /**
   * Obtenir l'instance unique du service
   */
  static getInstance(): GraphRateLimitService {
    if (!GraphRateLimitService.instance) {
      GraphRateLimitService.instance = new GraphRateLimitService();
    }
    return GraphRateLimitService.instance;
  }

  /**
   * Exécuter une opération avec retry et gestion des erreurs
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      timeout = 30000,
      backoffMultiplier = 2,
      maxBackoffMs = 60000,
      shouldRetry = this.defaultShouldRetry
    } = options;

    let lastError: Error;
    let totalAttempts = 0;
    this.requestStats.totalRequests++;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      totalAttempts++;

      try {
        // Vérifier le rate limiting global
        await this.waitForRateLimitIfNeeded();

        // Exécuter avec timeout
        const result = await this.executeWithTimeout(operation, timeout);

        // Mise à jour des statistiques de succès
        if (attempt > 0) {
          this.requestStats.retriedRequests++;
        }
        this.updateAverageRetryCount(attempt);

        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Mise à jour des statistiques
        if (this.isRateLimitError(error)) {
          this.requestStats.rateLimitedRequests++;
          this.updateRateLimitInfo(error);
        }

        // Déterminer si on doit réessayer
        const willRetry = attempt < maxRetries && shouldRetry(error, attempt);

        // Notifier les callbacks
        const retryInfo: RetryAttempt = {
          attempt: attempt + 1,
          error: lastError,
          nextRetryIn: willRetry ? this.calculateBackoff(attempt, backoffMultiplier, maxBackoffMs) : 0,
          willRetry
        };
        this.notifyRetryCallbacks(retryInfo);

        if (!willRetry) {
          this.requestStats.failedRequests++;
          throw lastError;
        }

        // Attendre avant le prochain retry
        const delay = this.calculateBackoff(attempt, backoffMultiplier, maxBackoffMs);
        await this.delay(delay);
      }
    }

    this.requestStats.failedRequests++;
    throw lastError!;
  }

  /**
   * Exécuter une opération avec timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      )
    ]);
  }

  /**
   * Calculer le délai de backoff exponentiel
   */
  private calculateBackoff(
    attempt: number,
    multiplier: number,
    maxBackoffMs: number
  ): number {
    const baseDelay = 1000; // 1 seconde
    const exponentialDelay = baseDelay * Math.pow(multiplier, attempt);
    const jitter = Math.random() * 1000; // 0-1 seconde de jitter
    return Math.min(exponentialDelay + jitter, maxBackoffMs);
  }

  /**
   * Fonction par défaut pour déterminer si on doit réessayer
   */
  private defaultShouldRetry = (error: any, attempt: number): boolean => {
    // Ne pas réessayer sur les erreurs d'authentification
    if (this.isAuthenticationError(error)) {
      return false;
    }

    // Ne pas réessayer sur les erreurs de permission
    if (this.isPermissionError(error)) {
      return false;
    }

    // Toujours réessayer sur les erreurs de rate limiting
    if (this.isRateLimitError(error)) {
      return true;
    }

    // Réessayer sur les erreurs temporaires
    if (this.isTemporaryError(error)) {
      return true;
    }

    // Réessayer sur les timeouts
    if (this.isTimeoutError(error)) {
      return true;
    }

    // Par défaut, réessayer jusqu'à la limite
    return true;
  };

  /**
   * Vérifier si l'erreur est liée à l'authentification
   */
  isAuthenticationError(error: unknown): boolean {
    const authCodes = ['InvalidAuthenticationToken', 'AuthenticationFailed', 'Unauthorized'];
    const errorObj = error as any;

    return authCodes.some(code =>
      errorObj?.code === code ||
      errorObj?.response?.status === 401 ||
      errorObj?.statusCode === 401
    );
  }

  /**
   * Vérifier si l'erreur est liée aux permissions
   */
  isPermissionError(error: unknown): boolean {
    const permissionCodes = ['Forbidden', 'InsufficientPrivileges', 'AccessDenied'];
    const errorObj = error as any;

    return permissionCodes.some(code =>
      errorObj?.code === code ||
      errorObj?.response?.status === 403 ||
      errorObj?.statusCode === 403
    );
  }

  /**
   * Vérifier si l'erreur est liée au rate limiting
   */
  isRateLimitError(error: unknown): boolean {
    const errorObj = error as any;
    return errorObj?.code === 'TooManyRequests' ||
           errorObj?.response?.status === 429 ||
           errorObj?.statusCode === 429;
  }

  /**
   * Vérifier si l'erreur est temporaire
   */
  isTemporaryError(error: unknown): boolean {
    const temporaryCodes = ['ServiceUnavailable', 'BadGateway', 'GatewayTimeout'];
    const errorObj = error as any;

    return temporaryCodes.some(code =>
      errorObj?.code === code ||
      errorObj?.response?.status === 503 ||
      errorObj?.response?.status === 502 ||
      errorObj?.response?.status === 504
    );
  }

  /**
   * Vérifier si l'erreur est un timeout
   */
  isTimeoutError(error: unknown): boolean {
    const errorObj = error as any;
    return errorObj?.message === 'Request timeout' ||
           errorObj?.code === 'ETIMEDOUT' ||
           errorObj?.code === 'RequestTimeout';
  }

  /**
   * Mettre à jour les informations de rate limiting
   */
  private updateRateLimitInfo(error: any): void {
    const headers = error?.response?.headers;
    if (!headers) return;

    const rateLimitInfo: RateLimitInfo = {
      limit: parseInt(headers['x-ratelimit-limit'] || '0'),
      remaining: parseInt(headers['x-ratelimit-remaining'] || '0'),
      reset: parseInt(headers['x-ratelimit-reset'] || '0') * 1000, // Convertir en millisecondes
      retryAfter: parseInt(headers['retry-after'] || '60')
    };

    if (rateLimitInfo.limit > 0) {
      this.rateLimitCache.set('global', rateLimitInfo);
    }
  }

  /**
   * Attendre si nécessaire avant d'exécuter une requête
   */
  private async waitForRateLimitIfNeeded(): Promise<void> {
    const rateLimitInfo = this.rateLimitCache.get('global');
    if (!rateLimitInfo) return;

    const now = Date.now();

    // Si on a atteint la limite et qu'on doit attendre
    if (rateLimitInfo.remaining <= 0 && rateLimitInfo.reset > now) {
      const waitTime = rateLimitInfo.reset - now;
      console.log(`Rate limit reached. Waiting ${waitTime}ms before next request...`);
      await this.delay(waitTime);
    }
  }

  /**
   * Fonction de délai
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Mettre à jour la moyenne du nombre de retries
   */
  private updateAverageRetryCount(retries: number): void {
    const { totalRequests, averageRetryCount } = this.requestStats;
    this.requestStats.averageRetryCount =
      (averageRetryCount * (totalRequests - 1) + retries) / totalRequests;
  }

  /**
   * Notifier les callbacks de retry
   */
  private notifyRetryCallbacks(attempt: RetryAttempt): void {
    this.retryCallbacks.forEach(callback => {
      try {
        callback(attempt);
      } catch (error) {
        console.error('Error in retry callback:', error);
      }
    });
  }

  /**
   * Enregistrer un callback pour les retries
   */
  onRetry(callback: (attempt: RetryAttempt) => void): () => void {
    this.retryCallbacks.push(callback);

    // Retourner une fonction de désinscription
    return () => {
      const index = this.retryCallbacks.indexOf(callback);
      if (index > -1) {
        this.retryCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Obtenir les informations de rate limiting actuelles
   */
  getRateLimitInfo(): RateLimitInfo | undefined {
    return this.rateLimitCache.get('global');
  }

  /**
   * Réinitialiser les informations de rate limiting
   */
  clearRateLimitInfo(): void {
    this.rateLimitCache.clear();
  }

  /**
   * Obtenir les statistiques de requêtes
   */
  getRequestStats(): RateLimitStats {
    return { ...this.requestStats };
  }

  /**
   * Réinitialiser les statistiques
   */
  resetStats(): void {
    this.requestStats = {
      totalRequests: 0,
      rateLimitedRequests: 0,
      retriedRequests: 0,
      failedRequests: 0,
      averageRetryCount: 0
    };
  }

  /**
   * Obtenir l'état du service
   */
  getServiceStatus(): {
    rateLimitInfo?: RateLimitInfo;
    stats: RateLimitStats;
    isRateLimited: boolean;
  } {
    const rateLimitInfo = this.getRateLimitInfo();
    const now = Date.now();

    return {
      rateLimitInfo,
      stats: this.getRequestStats(),
      isRateLimited: rateLimitInfo ?
        (rateLimitInfo.remaining <= 0 && rateLimitInfo.reset > now) : false
    };
  }
}