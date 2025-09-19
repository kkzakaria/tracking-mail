/**
 * Types pour le système de tracking d'emails
 * Intégration avec les services Microsoft Graph existants
 */

import { GraphOperationResult, PaginationOptions, PaginatedResult } from './graph-services';

/**
 * Statuts de tracking d'un email
 */
export type TrackingStatus =
  | 'sent'          // Email envoyé
  | 'delivered'     // Email délivré
  | 'opened'        // Email ouvert
  | 'clicked'       // Lien cliqué
  | 'replied'       // Réponse reçue
  | 'bounced'       // Email en erreur
  | 'failed';       // Échec d'envoi

/**
 * Types d'événements de tracking
 */
export type TrackingEventType =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'replied'
  | 'bounced'
  | 'unsubscribed';

/**
 * Données principales d'un email tracké
 */
export interface TrackedEmail {
  id: string;
  tracking_id: string;
  user_id: string;
  message_id?: string;
  conversation_id?: string;
  recipient_email: string;
  subject_hash?: string;
  sent_at: string;
  status: TrackingStatus;
  opened_at?: string;
  clicked_at?: string;
  reply_detected_at?: string;
  pixel_url?: string;
  tracking_links?: TrackingLink[];
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Événement de tracking
 */
export interface TrackingEvent {
  id: string;
  tracking_id: string;
  event_type: TrackingEventType;
  event_data?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  occurred_at: string;
}

/**
 * Lien tracké dans un email
 */
export interface TrackingLink {
  original_url: string;
  tracking_url: string;
  link_id: string;
  clicked_count: number;
  first_clicked_at?: string;
  last_clicked_at?: string;
}

/**
 * Options pour l'envoi d'un email avec tracking
 */
export interface SendWithTrackingOptions {
  // Options d'email standard (héritées du service existant)
  recipient: string;
  subject: string;
  body: string;
  isHtml?: boolean;

  // Options de tracking
  enableTracking?: boolean;
  trackOpens?: boolean;
  trackLinks?: boolean;
  trackingId?: string;
  customMetadata?: Record<string, any>;

  // Options de webhook
  webhookUrl?: string;
  notificationEmail?: string;

  // Utilisateur authentifié (pour RLS)
  authenticatedUserId?: string;
}

/**
 * Résultat de l'envoi avec tracking
 */
export interface SendWithTrackingResult {
  messageId?: string;
  trackingId?: string;
  status: 'sent' | 'failed';
  error?: string;
  tracking_url?: string;
}

/**
 * Statistiques de tracking pour un email
 */
export interface EmailTrackingStats {
  tracking_id: string;
  recipient_email: string;
  sent_at: string;
  status: TrackingStatus;
  events: TrackingEvent[];
  total_opens: number;
  total_clicks: number;
  unique_opens: number;
  unique_clicks: number;
  last_activity?: string;
}

/**
 * Filtres pour la recherche d'emails trackés
 */
export interface TrackingFilters extends PaginationOptions {
  status?: TrackingStatus | TrackingStatus[];
  recipient_email?: string;
  sent_after?: string;
  sent_before?: string;
  has_opened?: boolean;
  has_clicked?: boolean;
  has_replied?: boolean;
}

/**
 * Résultat paginé des emails trackés
 */
export interface TrackedEmailsResult extends PaginatedResult<TrackedEmail> {
  stats?: {
    total_sent: number;
    total_opened: number;
    total_clicked: number;
    total_replied: number;
    open_rate: number;
    click_rate: number;
    reply_rate: number;
  };
}

/**
 * Configuration de webhook pour le tracking
 */
export interface WebhookSubscription {
  id: string;
  user_id: string;
  subscription_id: string;
  resource_path: string;
  notification_url: string;
  expiration_datetime: string;
  last_renewal_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Payload de notification webhook
 */
export interface WebhookNotification {
  subscription_id: string;
  event_type: TrackingEventType;
  tracking_id: string;
  data: {
    email: TrackedEmail;
    event: TrackingEvent;
  };
  timestamp: string;
}

/**
 * Options de création de webhook
 */
export interface CreateWebhookOptions {
  resource_path: string;
  notification_url: string;
  expiration_hours?: number;
  event_types?: TrackingEventType[];
}

/**
 * Statistiques agrégées de tracking
 */
export interface TrackingAnalytics {
  period: 'day' | 'week' | 'month' | 'year';
  start_date: string;
  end_date: string;
  metrics: {
    emails_sent: number;
    emails_delivered: number;
    emails_opened: number;
    emails_clicked: number;
    emails_replied: number;
    emails_bounced: number;

    open_rate: number;
    click_rate: number;
    reply_rate: number;
    bounce_rate: number;

    top_recipients: Array<{
      email: string;
      sent_count: number;
      open_count: number;
      click_count: number;
      reply_count: number;
    }>;

    activity_by_hour: Array<{
      hour: number;
      opens: number;
      clicks: number;
    }>;

    device_stats: Array<{
      device_type: string;
      count: number;
      percentage: number;
    }>;
  };
}

/**
 * Options pour les analytics
 */
export interface AnalyticsOptions {
  period: 'day' | 'week' | 'month' | 'year';
  start_date?: string;
  end_date?: string;
  recipient_filter?: string;
  include_device_stats?: boolean;
  include_time_analysis?: boolean;
}

/**
 * Interface pour les opérations de tracking
 */
export interface EmailTrackingOperations {
  // Envoi avec tracking
  sendWithTracking(options: SendWithTrackingOptions): Promise<GraphOperationResult<SendWithTrackingResult>>;

  // Consultation
  getTrackedEmail(trackingId: string): Promise<GraphOperationResult<TrackedEmail>>;
  getTrackedEmails(filters?: TrackingFilters): Promise<TrackedEmailsResult>;
  getTrackingStats(trackingId: string): Promise<GraphOperationResult<EmailTrackingStats>>;

  // Mise à jour
  updateTrackingStatus(trackingId: string, status: TrackingStatus, eventData?: Record<string, any>): Promise<GraphOperationResult<boolean>>;
  addTrackingEvent(trackingId: string, event: Omit<TrackingEvent, 'id' | 'tracking_id' | 'occurred_at'>): Promise<GraphOperationResult<TrackingEvent>>;

  // Analytics
  getAnalytics(options: AnalyticsOptions): Promise<GraphOperationResult<TrackingAnalytics>>;

  // Webhooks
  createWebhookSubscription(options: CreateWebhookOptions): Promise<GraphOperationResult<WebhookSubscription>>;
  renewWebhookSubscription(subscriptionId: string): Promise<GraphOperationResult<WebhookSubscription>>;
  deleteWebhookSubscription(subscriptionId: string): Promise<GraphOperationResult<boolean>>;
}

/**
 * Interface pour les événements de tracking
 */
export interface TrackingEventCallbacks {
  onEmailSent?: (tracking: TrackedEmail) => void;
  onEmailOpened?: (tracking: TrackedEmail, event: TrackingEvent) => void;
  onEmailClicked?: (tracking: TrackedEmail, event: TrackingEvent) => void;
  onEmailReplied?: (tracking: TrackedEmail, event: TrackingEvent) => void;
  onEmailBounced?: (tracking: TrackedEmail, event: TrackingEvent) => void;
}

/**
 * Configuration du système de tracking
 */
export interface TrackingConfig {
  enabled: boolean;
  default_track_opens: boolean;
  default_track_links: boolean;
  pixel_domain: string;
  webhook_secret: string;
  cleanup_after_days: number;
  rate_limit_per_hour: number;
  max_tracking_links_per_email: number;
}

/**
 * Erreurs spécifiques au tracking
 */
export interface TrackingError {
  code: 'TRACKING_DISABLED' | 'INVALID_TRACKING_ID' | 'WEBHOOK_EXPIRED' | 'RATE_LIMIT_EXCEEDED' | 'INVALID_EMAIL_FORMAT' | 'TRACKING_NOT_FOUND';
  message: string;
  details?: any;
}

/**
 * Résultat d'opération avec erreurs de tracking
 */
export interface TrackingOperationResult<T = unknown> extends GraphOperationResult<T> {
  error?: TrackingError;
}

/**
 * Contexte d'une opération de tracking
 */
export interface TrackingContext {
  user_id: string;
  tracking_id?: string;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}