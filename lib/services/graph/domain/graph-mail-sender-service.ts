/**
 * Service d'envoi d'emails via Microsoft Graph
 * Responsable de l'envoi d'emails au nom des utilisateurs
 */

import { GraphClientFactory } from '../core/graph-client-factory';
import { GraphRateLimitService } from '../core/graph-rate-limit-service';
import type { GraphOperationResult } from '@/lib/types/microsoft-graph';
import type {
  SendWithTrackingOptions,
  SendWithTrackingResult,
  TrackedEmail,
  TrackingStatus,
  TrackingEventType
} from '@/lib/types/email-tracking';
import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';
import crypto from 'crypto';

/**
 * Structure d'un message email à envoyer
 */
export interface EmailMessage {
  subject: string;
  body: string;
  toRecipients: string[];
  ccRecipients?: string[];
  bccRecipients?: string[];
  importance?: 'low' | 'normal' | 'high';
  isHtml?: boolean;
  attachments?: EmailAttachment[];
  replyTo?: string[];
  saveToSentItems?: boolean;
}

/**
 * Structure d'une pièce jointe
 */
export interface EmailAttachment {
  name: string;
  contentType: string;
  contentBytes: string; // Base64 encoded
  isInline?: boolean;
  contentId?: string; // Pour les images inline
}

/**
 * Résultat d'envoi d'email
 */
export interface SendResult {
  messageId: string;
  sentAt: Date;
  recipientCount: number;
}

/**
 * Options d'envoi en masse
 */
export interface BulkSendOptions {
  batchSize?: number;
  delayBetweenBatches?: number;
  continueOnError?: boolean;
}

/**
 * Service d'envoi d'emails via Microsoft Graph
 */
export class GraphMailSenderService {
  private static instance: GraphMailSenderService;
  private clientFactory: GraphClientFactory;
  private rateLimitService: GraphRateLimitService;

  private constructor() {
    this.clientFactory = GraphClientFactory.getInstance();
    this.rateLimitService = GraphRateLimitService.getInstance();
  }

  /**
   * Obtenir l'instance unique du service
   */
  static getInstance(): GraphMailSenderService {
    if (!GraphMailSenderService.instance) {
      GraphMailSenderService.instance = new GraphMailSenderService();
    }
    return GraphMailSenderService.instance;
  }

  /**
   * Envoyer un email au nom d'un utilisateur
   */
  async sendMailAsUser(
    senderEmail: string,
    message: EmailMessage
  ): Promise<GraphOperationResult<SendResult>> {
    try {
      // Valider le message
      const validationResult = this.validateMailContent(message);
      if (!validationResult.success) {
        return {
          success: false,
          error: validationResult.error
        };
      }

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

      // Formater le message pour l'API Graph
      const graphMessage = this.formatEmailMessage(message);

      // Envoyer l'email
      const response = await this.rateLimitService.executeWithRetry(
        () => client
          .api(`/users/${senderEmail}/sendMail`)
          .post({
            message: graphMessage,
            saveToSentItems: message.saveToSentItems !== false
          }),
        { timeout: 30000, maxRetries: 2 }
      );

      const result: SendResult = {
        messageId: response?.id || `msg-${Date.now()}`,
        sentAt: new Date(),
        recipientCount:
          message.toRecipients.length +
          (message.ccRecipients?.length || 0) +
          (message.bccRecipients?.length || 0)
      };

      return { success: true, data: result };

    } catch (error) {
      console.error('Error sending email:', error);
      return this.handleSendError(error);
    }
  }

  /**
   * Envoyer des emails en masse
   */
  async sendBulkMail(
    senderEmail: string,
    messages: EmailMessage[],
    options: BulkSendOptions = {}
  ): Promise<GraphOperationResult<{
    sent: SendResult[];
    failed: Array<{ message: EmailMessage; error: any }>;
  }>> {
    const {
      batchSize = 10,
      delayBetweenBatches = 1000,
      continueOnError = true
    } = options;

    const sent: SendResult[] = [];
    const failed: Array<{ message: EmailMessage; error: any }> = [];

    try {
      // Diviser les messages en lots
      const batches = this.createBatches(messages, batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        // Envoyer chaque message du lot
        for (const message of batch) {
          try {
            const result = await this.sendMailAsUser(senderEmail, message);

            if (result.success && result.data) {
              sent.push(result.data);
            } else {
              failed.push({ message, error: result.error });
              if (!continueOnError) {
                break;
              }
            }

          } catch (error) {
            failed.push({ message, error });
            if (!continueOnError) {
              throw error;
            }
          }
        }

        // Attendre entre les lots pour éviter le rate limiting
        if (i < batches.length - 1) {
          await this.delay(delayBetweenBatches);
        }
      }

      return {
        success: true,
        data: { sent, failed }
      };

    } catch (error) {
      console.error('Error sending bulk mail:', error);
      return {
        success: false,
        error: {
          code: 'BULK_SEND_ERROR',
          message: 'Erreur lors de l\'envoi en masse',
          details: { sent, failed, error }
        }
      };
    }
  }

  /**
   * Créer un brouillon d'email
   */
  async createDraft(
    userEmail: string,
    message: EmailMessage
  ): Promise<GraphOperationResult<{ draftId: string }>> {
    try {
      const validationResult = this.validateMailContent(message);
      if (!validationResult.success) {
        return {
          success: false,
          error: validationResult.error
        };
      }

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
      const graphMessage = this.formatEmailMessage(message);

      const response = await this.rateLimitService.executeWithRetry(
        () => client
          .api(`/users/${userEmail}/messages`)
          .post(graphMessage),
        { timeout: 15000, maxRetries: 2 }
      );

      return {
        success: true,
        data: { draftId: response.id }
      };

    } catch (error) {
      console.error('Error creating draft:', error);
      return this.handleSendError(error);
    }
  }

  /**
   * Répondre à un message
   */
  async replyToMessage(
    userEmail: string,
    messageId: string,
    replyContent: {
      comment: string;
      isHtml?: boolean;
      replyAll?: boolean;
    }
  ): Promise<GraphOperationResult<SendResult>> {
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

      const endpoint = replyContent.replyAll
        ? `/users/${userEmail}/messages/${messageId}/replyAll`
        : `/users/${userEmail}/messages/${messageId}/reply`;

      await this.rateLimitService.executeWithRetry(
        () => client
          .api(endpoint)
          .post({
            comment: replyContent.comment,
            message: {
              body: {
                contentType: replyContent.isHtml ? 'HTML' : 'Text',
                content: replyContent.comment
              }
            }
          }),
        { timeout: 15000, maxRetries: 2 }
      );

      const result: SendResult = {
        messageId: messageId,
        sentAt: new Date(),
        recipientCount: 1
      };

      return { success: true, data: result };

    } catch (error) {
      console.error('Error replying to message:', error);
      return this.handleSendError(error);
    }
  }

  /**
   * Transférer un message
   */
  async forwardMessage(
    userEmail: string,
    messageId: string,
    forwardTo: string[],
    comment?: string
  ): Promise<GraphOperationResult<SendResult>> {
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

      await this.rateLimitService.executeWithRetry(
        () => client
          .api(`/users/${userEmail}/messages/${messageId}/forward`)
          .post({
            comment: comment || '',
            toRecipients: forwardTo.map(email => ({
              emailAddress: { address: email }
            }))
          }),
        { timeout: 15000, maxRetries: 2 }
      );

      const result: SendResult = {
        messageId: messageId,
        sentAt: new Date(),
        recipientCount: forwardTo.length
      };

      return { success: true, data: result };

    } catch (error) {
      console.error('Error forwarding message:', error);
      return this.handleSendError(error);
    }
  }

  /**
   * Valider le contenu d'un email
   */
  validateMailContent(message: EmailMessage): GraphOperationResult<boolean> {
    const errors: string[] = [];

    // Validation du sujet
    if (!message.subject || message.subject.trim().length === 0) {
      errors.push('Le sujet est requis');
    } else if (message.subject.length > 255) {
      errors.push('Le sujet ne peut pas dépasser 255 caractères');
    }

    // Validation du corps
    if (!message.body || message.body.trim().length === 0) {
      errors.push('Le corps du message est requis');
    }

    // Validation des destinataires
    if (!message.toRecipients || message.toRecipients.length === 0) {
      errors.push('Au moins un destinataire est requis');
    } else {
      const invalidEmails = [
        ...message.toRecipients,
        ...(message.ccRecipients || []),
        ...(message.bccRecipients || [])
      ].filter(email => !this.isValidEmail(email));

      if (invalidEmails.length > 0) {
        errors.push(`Adresses email invalides : ${invalidEmails.join(', ')}`);
      }
    }

    // Validation des pièces jointes
    if (message.attachments) {
      for (const attachment of message.attachments) {
        if (!attachment.name || !attachment.contentType || !attachment.contentBytes) {
          errors.push('Les pièces jointes doivent avoir un nom, un type et un contenu');
        }
        // Limite de taille (25 MB pour Graph API)
        const sizeInBytes = attachment.contentBytes.length * 0.75; // Base64 to bytes approximation
        if (sizeInBytes > 25 * 1024 * 1024) {
          errors.push(`La pièce jointe ${attachment.name} dépasse la limite de 25 MB`);
        }
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Erreurs de validation',
          details: errors
        }
      };
    }

    return { success: true, data: true };
  }

  /**
   * Formater un message pour l'API Graph
   */
  private formatEmailMessage(message: EmailMessage): any {
    const graphMessage: any = {
      subject: message.subject,
      importance: message.importance || 'normal',
      body: {
        contentType: message.isHtml ? 'HTML' : 'Text',
        content: message.body
      },
      toRecipients: message.toRecipients.map(email => ({
        emailAddress: { address: email }
      }))
    };

    if (message.ccRecipients && message.ccRecipients.length > 0) {
      graphMessage.ccRecipients = message.ccRecipients.map(email => ({
        emailAddress: { address: email }
      }));
    }

    if (message.bccRecipients && message.bccRecipients.length > 0) {
      graphMessage.bccRecipients = message.bccRecipients.map(email => ({
        emailAddress: { address: email }
      }));
    }

    if (message.replyTo && message.replyTo.length > 0) {
      graphMessage.replyTo = message.replyTo.map(email => ({
        emailAddress: { address: email }
      }));
    }

    if (message.attachments && message.attachments.length > 0) {
      graphMessage.attachments = message.attachments.map(att => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.name,
        contentType: att.contentType,
        contentBytes: att.contentBytes,
        isInline: att.isInline || false,
        contentId: att.contentId
      }));
    }

    return graphMessage;
  }

  /**
   * Valider une adresse email
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Créer des lots de messages
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Fonction de délai
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Envoyer un email avec tracking
   */
  async sendMailWithTracking(
    senderEmail: string,
    options: SendWithTrackingOptions
  ): Promise<GraphOperationResult<SendWithTrackingResult>> {
    try {
      // Générer un tracking ID unique si non fourni
      const trackingId = options.trackingId || this.generateTrackingId();

      // Préparer le message email
      const emailMessage: EmailMessage = {
        subject: options.subject,
        body: options.enableTracking ?
          await this.injectTrackingPixel(options.body, trackingId, options.isHtml) :
          options.body,
        toRecipients: [options.recipient],
        isHtml: options.isHtml,
        saveToSentItems: true
      };

      // Envoyer l'email via la méthode existante
      const sendResult = await this.sendMailAsUser(senderEmail, emailMessage);

      if (!sendResult.success) {
        return {
          success: false,
          error: sendResult.error
        };
      }

      let trackingData: TrackedEmail | null = null;

      // Créer l'enregistrement de tracking si activé
      if (options.enableTracking) {
        const trackingCreateResult = await this.createTrackingRecord({
          tracking_id: trackingId,
          user_id: options.authenticatedUserId || senderEmail, // Utiliser l'UUID authentifié si disponible
          message_id: sendResult.data?.messageId || '',
          recipient_email: options.recipient,
          subject_hash: this.hashSubject(options.subject),
          sent_at: new Date().toISOString(),
          status: 'sent',
          pixel_url: this.generatePixelUrl(trackingId),
          metadata: options.customMetadata || {}
        });

        if (trackingCreateResult.success) {
          trackingData = trackingCreateResult.data || null;
        }
      }

      const result: SendWithTrackingResult = {
        messageId: sendResult.data?.messageId,
        trackingId: options.enableTracking ? trackingId : undefined,
        status: 'sent',
        tracking_url: options.enableTracking ? this.generateTrackingUrl(trackingId) : undefined
      };

      return { success: true, data: result };

    } catch (error) {
      console.error('Error sending tracked email:', error);
      return this.handleSendError(error);
    }
  }

  /**
   * Obtenir le statut de tracking d'un email
   */
  async getTrackingStatus(trackingId: string): Promise<GraphOperationResult<TrackedEmail>> {
    try {
      const supabase = await createSupabaseServerClient();

      const { data, error } = await (supabase as any)
        .from('email_tracking')
        .select('*')
        .eq('tracking_id', trackingId)
        .single();

      if (error) {
        return {
          success: false,
          error: {
            code: 'TRACKING_NOT_FOUND',
            message: 'Email tracking non trouvé',
            details: error
          }
        };
      }

      return { success: true, data: data as TrackedEmail };

    } catch (error) {
      console.error('Error getting tracking status:', error);
      return {
        success: false,
        error: {
          code: 'TRACKING_ERROR',
          message: 'Erreur lors de la récupération du statut',
          details: error
        }
      };
    }
  }

  /**
   * Mettre à jour le statut de tracking
   */
  async updateTrackingStatus(
    trackingId: string,
    status: TrackingStatus,
    eventData?: Record<string, any>
  ): Promise<GraphOperationResult<boolean>> {
    try {
      const supabase = await createSupabaseServerClient();

      // Mettre à jour le statut principal
      const updateData: Partial<TrackedEmail> = {
        status,
        updated_at: new Date().toISOString()
      };

      // Ajouter les timestamps spécifiques selon le statut
      if (status === 'opened' && !eventData?.opened_at) {
        updateData.opened_at = new Date().toISOString();
      }
      if (status === 'clicked' && !eventData?.clicked_at) {
        updateData.clicked_at = new Date().toISOString();
      }
      if (status === 'replied' && !eventData?.reply_detected_at) {
        updateData.reply_detected_at = new Date().toISOString();
      }

      const { error: updateError } = await (supabase as any)
        .from('email_tracking')
        .update(updateData)
        .eq('tracking_id', trackingId);

      if (updateError) {
        return {
          success: false,
          error: {
            code: 'UPDATE_ERROR',
            message: 'Erreur lors de la mise à jour du tracking',
            details: updateError
          }
        };
      }

      // Ajouter un événement de tracking
      const { error: eventError } = await (supabase as any)
        .from('email_tracking_events')
        .insert({
          tracking_id: trackingId,
          event_type: status as TrackingEventType,
          event_data: eventData || {},
          ip_address: eventData?.ip_address,
          user_agent: eventData?.user_agent,
          occurred_at: new Date().toISOString()
        });

      if (eventError) {
        console.warn('Failed to create tracking event:', eventError);
        // Ne pas faire échouer la mise à jour principale pour cela
      }

      return { success: true, data: true };

    } catch (error) {
      console.error('Error updating tracking status:', error);
      return {
        success: false,
        error: {
          code: 'UPDATE_ERROR',
          message: 'Erreur lors de la mise à jour du statut',
          details: error
        }
      };
    }
  }

  /**
   * Créer un enregistrement de tracking en base
   */
  private async createTrackingRecord(
    trackingData: Omit<TrackedEmail, 'id' | 'created_at' | 'updated_at'>
  ): Promise<GraphOperationResult<TrackedEmail>> {
    try {
      const supabase = await createSupabaseServerClient();

      const { data, error } = await (supabase as any)
        .from('email_tracking')
        .insert({
          ...trackingData
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating tracking record:', error);
        return {
          success: false,
          error: {
            code: 'CREATE_TRACKING_ERROR',
            message: 'Erreur lors de la création du tracking',
            details: error
          }
        };
      }

      return { success: true, data: data as TrackedEmail };

    } catch (error) {
      console.error('Error creating tracking record:', error);
      return {
        success: false,
        error: {
          code: 'CREATE_TRACKING_ERROR',
          message: 'Erreur lors de la création du tracking',
          details: error
        }
      };
    }
  }

  /**
   * Générer un ID de tracking unique
   */
  private generateTrackingId(): string {
    return 'track_' + crypto.randomBytes(16).toString('hex');
  }

  /**
   * Générer un hash du sujet pour la privacy
   */
  private hashSubject(subject: string): string {
    return crypto.createHash('sha256').update(subject).digest('hex').substring(0, 64);
  }

  /**
   * Injecter un pixel de tracking dans le contenu HTML
   */
  private async injectTrackingPixel(
    body: string,
    trackingId: string,
    isHtml: boolean = false
  ): Promise<string> {
    const pixelUrl = this.generatePixelUrl(trackingId);

    if (!isHtml) {
      // Pour le texte brut, ajouter juste une note discrète
      return body + '\n\n---\nThis email was sent with tracking enabled.';
    }

    // Pour HTML, injecter un pixel transparent
    const trackingPixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />`;

    // Essayer d'injecter avant la balise de fermeture body
    if (body.includes('</body>')) {
      return body.replace('</body>', `${trackingPixel}</body>`);
    }

    // Sinon, ajouter à la fin
    return body + trackingPixel;
  }

  /**
   * Générer l'URL du pixel de tracking
   */
  private generatePixelUrl(trackingId: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return `${baseUrl}/api/tracking/pixel/${trackingId}`;
  }

  /**
   * Générer l'URL de suivi pour l'utilisateur
   */
  private generateTrackingUrl(trackingId: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return `${baseUrl}/tracking/${trackingId}`;
  }

  /**
   * Gérer les erreurs d'envoi
   */
  private handleSendError(error: any): GraphOperationResult<any> {
    let errorCode = 'SEND_ERROR';
    let errorMessage = 'Erreur lors de l\'envoi de l\'email';

    if (this.rateLimitService.isAuthenticationError(error)) {
      errorCode = 'AUTH_ERROR';
      errorMessage = 'Erreur d\'authentification Microsoft Graph';
    } else if (this.rateLimitService.isPermissionError(error)) {
      errorCode = 'PERMISSION_ERROR';
      errorMessage = 'Permissions insuffisantes pour envoyer des emails';
    } else if (this.rateLimitService.isRateLimitError(error)) {
      errorCode = 'RATE_LIMIT_ERROR';
      errorMessage = 'Limite de taux dépassée, veuillez réessayer plus tard';
    } else if (error?.message?.includes('recipient')) {
      errorCode = 'INVALID_RECIPIENT';
      errorMessage = 'Adresse de destinataire invalide';
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