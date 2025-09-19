/**
 * Client API pour les endpoints de tracking d'emails
 */

export interface SendTrackedEmailRequest {
  to: string;
  subject: string;
  body: string;
  bodyType: 'text' | 'html';
  enableTracking: boolean;
  trackingOptions?: {
    trackOpens: boolean;
    trackClicks: boolean;
    trackReplies: boolean;
  };
}

export interface SendTrackedEmailResponse {
  success: boolean;
  data?: {
    trackingId: string;
    messageId: string;
    pixelUrl?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface TrackingStatusResponse {
  success: boolean;
  data?: {
    trackingId: string;
    status: string;
    sentAt: string;
    openedAt?: string;
    clickedAt?: string;
    replyDetectedAt?: string;
    recipientEmail: string;
    metadata?: Record<string, any>;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface AnalyticsRequest {
  period?: 'day' | 'week' | 'month' | 'year';
  startDate?: string;
  endDate?: string;
  recipientFilter?: string;
  includeDeviceStats?: boolean;
  includeTimeAnalysis?: boolean;
}

export interface AnalyticsResponse {
  success: boolean;
  data?: {
    period: string;
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
      activity_by_hour?: Array<{
        hour: number;
        opens: number;
        clicks: number;
      }>;
      device_stats?: Array<{
        device_type: string;
        count: number;
        percentage: number;
      }>;
    };
  };
  error?: {
    code: string;
    message: string;
  };
  metadata?: {
    generated_at: string;
    user_id: string;
    parameters: AnalyticsRequest;
  };
}

export class TrackingApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Envoyer un email avec tracking
   */
  async sendTrackedEmail(request: SendTrackedEmailRequest): Promise<SendTrackedEmailResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/mail/send-tracked`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Inclure les cookies de session
        body: JSON.stringify(request),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: data.error?.message || data.message || response.statusText,
            details: data
          }
        };
      }

      return data;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Erreur réseau inconnue'
        }
      };
    }
  }

  /**
   * Obtenir le statut d'un email tracké
   */
  async getTrackingStatus(trackingId: string): Promise<TrackingStatusResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/mail/tracking/${trackingId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: data.error?.message || data.message || response.statusText
          }
        };
      }

      return data;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Erreur réseau inconnue'
        }
      };
    }
  }

  /**
   * Obtenir les analytics de tracking
   */
  async getAnalytics(request: AnalyticsRequest = {}): Promise<AnalyticsResponse> {
    try {
      const params = new URLSearchParams();

      if (request.period) params.append('period', request.period);
      if (request.startDate) params.append('start_date', request.startDate);
      if (request.endDate) params.append('end_date', request.endDate);
      if (request.recipientFilter) params.append('recipient_filter', request.recipientFilter);
      if (request.includeDeviceStats !== undefined) {
        params.append('include_device_stats', request.includeDeviceStats.toString());
      }
      if (request.includeTimeAnalysis !== undefined) {
        params.append('include_time_analysis', request.includeTimeAnalysis.toString());
      }

      const url = `${this.baseUrl}/api/mail/tracking/analytics${params.toString() ? `?${params}` : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: data.error?.message || data.message || response.statusText
          }
        };
      }

      return data;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Erreur réseau inconnue'
        }
      };
    }
  }

  /**
   * Tester le pixel de tracking
   */
  async testPixel(trackingId: string): Promise<{
    success: boolean;
    responseTime?: number;
    contentType?: string;
    error?: string;
  }> {
    try {
      const startTime = Date.now();

      const response = await fetch(`${this.baseUrl}/api/tracking/pixel/${trackingId}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Email-Tracking-Test/1.0',
          'Accept': 'image/*'
        }
      });

      const responseTime = Date.now() - startTime;
      const contentType = response.headers.get('content-type') || '';

      if (response.ok) {
        return {
          success: true,
          responseTime,
          contentType
        };
      } else {
        return {
          success: false,
          responseTime,
          error: `Erreur HTTP ${response.status}: ${response.statusText}`
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur réseau'
      };
    }
  }

  /**
   * Tester l'endpoint webhook
   */
  async testWebhook(payload: any): Promise<{
    success: boolean;
    status?: number;
    message?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/webhooks/graph-notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return {
          success: true,
          status: response.status,
          message: `Webhook testé avec succès (${response.status})`
        };
      } else {
        return {
          success: false,
          status: response.status,
          error: `Erreur ${response.status}: ${response.statusText}`
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur réseau'
      };
    }
  }

  /**
   * Obtenir la documentation de l'API analytics
   */
  async getAnalyticsDocumentation(): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/mail/tracking/analytics`, {
        method: 'OPTIONS',
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          data
        };
      } else {
        return {
          success: false,
          error: `Erreur ${response.status}: ${response.statusText}`
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur réseau'
      };
    }
  }
}

// Instance par défaut
export const trackingApiClient = new TrackingApiClient();