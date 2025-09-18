/**
 * Types partagés pour les services Microsoft Graph
 * Interfaces communes et types utilitaires pour tous les services Graph
 */

/**
 * Interface de base pour tous les services Graph
 */
export interface GraphServiceBase {
  initialize(): Promise<GraphOperationResult<boolean>>;
  getServiceStatus(): Promise<GraphOperationResult<ServiceStatus>> | ServiceStatus;
}

/**
 * Interface pour les services qui peuvent créer des clients
 */
export interface GraphClientProvider {
  createClient(): Promise<any | null>;
  isClientReady(): boolean;
}

/**
 * Interface pour les services qui gèrent le retry
 */
export interface GraphRateLimitHandler {
  executeWithRetry<T>(
    operation: () => Promise<T>,
    options?: RetryOptions
  ): Promise<T>;
}

/**
 * Statut d'un service
 */
export interface ServiceStatus {
  isInitialized: boolean;
  isReady: boolean;
  lastError?: string;
  metadata?: Record<string, any>;
}

/**
 * Options de retry pour les opérations Graph
 */
export interface RetryOptions {
  maxRetries?: number;
  timeout?: number;
  backoffMultiplier?: number;
  maxBackoffMs?: number;
}

/**
 * Résultat d'une opération Graph avec gestion d'erreur
 */
export interface GraphOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: GraphError;
}

/**
 * Structure d'erreur standardisée
 */
export interface GraphError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Configuration des dépendances des services
 */
export interface ServiceDependencies {
  tokenService?: any;
  configService?: any;
  rateLimitService?: any;
  clientFactory?: any;
}

/**
 * Options de pagination pour les requêtes Graph
 */
export interface PaginationOptions {
  top?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

/**
 * Métadonnées de pagination
 */
export interface PaginationMetadata {
  currentPage: number;
  pageSize: number;
  totalItems?: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextLink?: string;
}

/**
 * Résultat paginé
 */
export interface PaginatedResult<T> extends GraphOperationResult<T[]> {
  pagination?: PaginationMetadata;
}

/**
 * Types d'événements pour les callbacks
 */
export type GraphEventType =
  | 'token_refreshed'
  | 'rate_limit_hit'
  | 'operation_failed'
  | 'operation_success'
  | 'service_initialized'
  | 'configuration_updated';

/**
 * Callback d'événement
 */
export interface GraphEventCallback {
  type: GraphEventType;
  handler: (data?: any) => void;
}

/**
 * Interface pour les services qui émettent des événements
 */
export interface GraphEventEmitter {
  on(type: GraphEventType, handler: (data?: any) => void): () => void;
  emit(type: GraphEventType, data?: any): void;
}

/**
 * Informations de performance d'une opération
 */
export interface PerformanceInfo {
  startTime: number;
  endTime: number;
  duration: number;
  retries: number;
  success: boolean;
}

/**
 * Métriques de service
 */
export interface ServiceMetrics {
  operationCount: number;
  successCount: number;
  errorCount: number;
  averageResponseTime: number;
  rateLimitHits: number;
  cacheHits: number;
  cacheMisses: number;
}

/**
 * Options de journalisation
 */
export interface LoggingOptions {
  level: 'debug' | 'info' | 'warn' | 'error';
  includeRequestData?: boolean;
  includeResponseData?: boolean;
  maxLogSize?: number;
}

/**
 * Interface pour les services avec logging
 */
export interface GraphLoggableService {
  setLoggingOptions(options: LoggingOptions): void;
  getLogs(filter?: { level?: string; since?: Date }): any[];
}

/**
 * Contexte d'exécution pour les opérations
 */
export interface OperationContext {
  operationId: string;
  userId?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
  timeout?: number;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Interface pour les services avec contexte
 */
export interface GraphContextualService {
  executeInContext<T>(
    context: OperationContext,
    operation: () => Promise<T>
  ): Promise<GraphOperationResult<T>>;
}

/**
 * Configuration de cache
 */
export interface CacheConfig {
  enabled: boolean;
  ttl: number; // Time to live en secondes
  maxSize: number;
  strategy: 'lru' | 'lfu' | 'fifo';
}

/**
 * Interface pour les services avec cache
 */
export interface GraphCacheableService {
  setCacheConfig(config: CacheConfig): void;
  clearCache(pattern?: string): void;
  getCacheStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
}

/**
 * Configuration de sécurité
 */
export interface SecurityConfig {
  enableTokenValidation: boolean;
  enablePermissionChecks: boolean;
  allowedScopes: string[];
  requiredRoles: string[];
  auditOperations: boolean;
}

/**
 * Interface pour les services avec sécurité
 */
export interface GraphSecureService {
  setSecurityConfig(config: SecurityConfig): void;
  validateAccess(context: OperationContext): Promise<GraphOperationResult<boolean>>;
  auditOperation(operation: string, context: OperationContext, result: any): void;
}

/**
 * Factory pour créer des services
 */
export interface GraphServiceFactory {
  createService<T extends GraphServiceBase>(
    serviceType: string,
    dependencies?: ServiceDependencies
  ): Promise<GraphOperationResult<T>>;
}

/**
 * Registre de services
 */
export interface GraphServiceRegistry {
  register<T extends GraphServiceBase>(name: string, service: T): void;
  get<T extends GraphServiceBase>(name: string): T | null;
  unregister(name: string): void;
  list(): string[];
}

/**
 * Configuration globale des services Graph
 */
export interface GraphServicesConfig {
  baseUrl?: string;
  version?: string;
  timeout?: number;
  retries?: number;
  cache?: CacheConfig;
  security?: SecurityConfig;
  logging?: LoggingOptions;
  rateLimit?: {
    enabled: boolean;
    requestsPerSecond: number;
    burstLimit: number;
  };
}

/**
 * Interface principale pour le gestionnaire de services
 */
export interface GraphServicesManager {
  initialize(config: GraphServicesConfig): Promise<GraphOperationResult<boolean>>;
  getService<T extends GraphServiceBase>(name: string): T | null;
  getServiceStatus(name: string): ServiceStatus;
  getAllServices(): Record<string, GraphServiceBase>;
  shutdown(): Promise<void>;
}