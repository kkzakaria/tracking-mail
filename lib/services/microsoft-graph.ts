import { Client } from '@microsoft/microsoft-graph-client';
import { ConfidentialClientApplication, ClientCredentialRequest } from '@azure/msal-node';
import {
  TokenResponse,
  MicrosoftUser,
  AuthenticationResult,
  GraphApiError,
  GraphRequestOptions,
  RateLimitInfo
} from '../types/microsoft-graph';
import { MICROSOFT_GRAPH_CONFIG, GRAPH_ENDPOINTS, RATE_LIMIT_CONFIG } from '../config/microsoft-graph';
import { encryptToken, decryptToken } from '../utils/encryption';
import { TokenStorage, AuthAttemptLogger } from './supabase-client';

/**
 * Microsoft Graph API Service
 * Handles authentication and API interactions with Microsoft Graph
 */
export class MicrosoftGraphService {
  private confidentialClient: ConfidentialClientApplication;
  private static instance: MicrosoftGraphService;
  private rateLimitCache = new Map<string, RateLimitInfo>();

  constructor() {
    this.confidentialClient = new ConfidentialClientApplication({
      auth: {
        clientId: MICROSOFT_GRAPH_CONFIG.clientId,
        clientSecret: MICROSOFT_GRAPH_CONFIG.clientSecret,
        authority: `https://login.microsoftonline.com/${MICROSOFT_GRAPH_CONFIG.tenantId}`
      }
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MicrosoftGraphService {
    if (!MicrosoftGraphService.instance) {
      MicrosoftGraphService.instance = new MicrosoftGraphService();
    }
    return MicrosoftGraphService.instance;
  }

  /**
   * Acquire application token using client credentials
   */
  async acquireApplicationToken(): Promise<string> {
    try {
      const clientCredentialRequest: ClientCredentialRequest = {
        scopes: ['https://graph.microsoft.com/.default']
      };

      const response = await this.confidentialClient.acquireTokenByClientCredential(clientCredentialRequest);

      if (!response?.accessToken) {
        throw new Error('Failed to acquire access token');
      }

      return response.accessToken;
    } catch (error) {
      console.error('Error acquiring application token:', error);
      throw new Error(`Failed to acquire application token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create authenticated Graph client
   */
  async createGraphClient(accessToken?: string): Promise<Client> {
    const token = accessToken || await this.acquireApplicationToken();

    return Client.init({
      authProvider: async () => token,
      defaultVersion: 'v1.0'
    });
  }

  /**
   * Get user information from Microsoft Graph
   */
  async getUser(userId: string, accessToken?: string): Promise<MicrosoftUser> {
    try {
      const client = await this.createGraphClient(accessToken);

      const user = await client
        .api(`/users/${userId}`)
        .select('id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,department,businessPhones,mobilePhone')
        .get();

      return {
        id: user.id,
        displayName: user.displayName,
        mail: user.mail,
        userPrincipalName: user.userPrincipalName,
        givenName: user.givenName,
        surname: user.surname,
        jobTitle: user.jobTitle,
        department: user.department,
        businessPhones: user.businessPhones,
        mobilePhone: user.mobilePhone
      };
    } catch (error) {
      console.error('Error getting user:', error);
      throw this.handleGraphError(error);
    }
  }

  /**
   * Get all users in the organization
   */
  async getAllUsers(accessToken?: string, options?: GraphRequestOptions): Promise<MicrosoftUser[]> {
    try {
      const client = await this.createGraphClient(accessToken);

      let users: MicrosoftUser[] = [];
      let nextLink = '/users';

      while (nextLink) {
        const response = await this.executeWithRetry(
          () => client.api(nextLink)
            .select('id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,department')
            .top(100)
            .get(),
          options
        );

        users = users.concat(response.value.map((user: any) => ({
          id: user.id,
          displayName: user.displayName,
          mail: user.mail,
          userPrincipalName: user.userPrincipalName,
          givenName: user.givenName,
          surname: user.surname,
          jobTitle: user.jobTitle,
          department: user.department
        })));

        nextLink = response['@odata.nextLink'] ? new URL(response['@odata.nextLink']).pathname + new URL(response['@odata.nextLink']).search : null;
      }

      return users;
    } catch (error) {
      console.error('Error getting all users:', error);
      throw this.handleGraphError(error);
    }
  }

  /**
   * Get user's mail messages
   */
  async getUserMail(userId: string, accessToken?: string, options?: GraphRequestOptions) {
    try {
      const client = await this.createGraphClient(accessToken);

      const messages = await this.executeWithRetry(
        () => client.api(`/users/${userId}/messages`)
          .select('id,subject,from,receivedDateTime,bodyPreview,isRead')
          .top(50)
          .orderby('receivedDateTime desc')
          .get(),
        options
      );

      return messages.value;
    } catch (error) {
      console.error('Error getting user mail:', error);
      throw this.handleGraphError(error);
    }
  }

  /**
   * Send email on behalf of user
   */
  async sendMail(userId: string, message: any, accessToken?: string, options?: GraphRequestOptions) {
    try {
      const client = await this.createGraphClient(accessToken);

      await this.executeWithRetry(
        () => client.api(`/users/${userId}/sendMail`).post({ message }),
        options
      );

      return { success: true };
    } catch (error) {
      console.error('Error sending mail:', error);
      throw this.handleGraphError(error);
    }
  }

  /**
   * Get user's calendar events
   */
  async getUserCalendar(userId: string, accessToken?: string, options?: GraphRequestOptions) {
    try {
      const client = await this.createGraphClient(accessToken);

      const events = await this.executeWithRetry(
        () => client.api(`/users/${userId}/events`)
          .select('id,subject,start,end,organizer,attendees')
          .top(50)
          .orderby('start/dateTime')
          .get(),
        options
      );

      return events.value;
    } catch (error) {
      console.error('Error getting user calendar:', error);
      throw this.handleGraphError(error);
    }
  }

  /**
   * Execute request with retry logic and rate limiting
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: GraphRequestOptions = {}
  ): Promise<T> {
    const { retries = 3, timeout = 30000, rateLimitHandling = true } = options;
    let lastError: Error;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Check rate limiting
        if (rateLimitHandling && this.isRateLimited()) {
          await this.waitForRateLimit();
        }

        // Execute with timeout
        const result = await Promise.race([
          operation(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
          )
        ]);

        // Update rate limit info from response headers if available
        this.updateRateLimitInfo();

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Don't retry on authentication errors
        if (this.isAuthenticationError(error)) {
          throw lastError;
        }

        // Handle rate limiting
        if (this.isRateLimitError(error)) {
          const delay = this.calculateRetryDelay(attempt);
          console.warn(`Rate limited, waiting ${delay}ms before retry ${attempt + 1}/${retries}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Don't retry on final attempt
        if (attempt === retries) {
          throw lastError;
        }

        // Exponential backoff
        const delay = RATE_LIMIT_CONFIG.RETRY_DELAYS[attempt] || 16000;
        console.warn(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Handle Graph API errors
   */
  private handleGraphError(error: any): Error {
    if (error?.code) {
      const graphError: GraphApiError = error;
      return new Error(`Microsoft Graph API Error: ${graphError.code} - ${graphError.message}`);
    }

    if (error?.response?.status) {
      return new Error(`Microsoft Graph API Error: HTTP ${error.response.status}`);
    }

    return new Error(`Microsoft Graph API Error: ${error.message || 'Unknown error'}`);
  }

  /**
   * Check if error is authentication related
   */
  private isAuthenticationError(error: any): boolean {
    const authCodes = ['InvalidAuthenticationToken', 'AuthenticationFailed', 'Forbidden', 'Unauthorized'];
    return authCodes.some(code =>
      error?.code === code ||
      error?.response?.status === 401 ||
      error?.response?.status === 403
    );
  }

  /**
   * Check if error is rate limiting related
   */
  private isRateLimitError(error: any): boolean {
    return error?.code === 'TooManyRequests' ||
           error?.response?.status === 429;
  }

  /**
   * Check if currently rate limited
   */
  private isRateLimited(): boolean {
    const now = Date.now();
    const rateLimitInfo = this.rateLimitCache.get('global');

    if (!rateLimitInfo) return false;

    return rateLimitInfo.remaining <= 0 && now < rateLimitInfo.reset;
  }

  /**
   * Wait for rate limit to reset
   */
  private async waitForRateLimit(): Promise<void> {
    const rateLimitInfo = this.rateLimitCache.get('global');
    if (!rateLimitInfo) return;

    const waitTime = Math.max(0, rateLimitInfo.reset - Date.now());
    if (waitTime > 0) {
      console.warn(`Rate limited, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Update rate limit information
   */
  private updateRateLimitInfo(headers?: any): void {
    if (!headers) return;

    const remaining = parseInt(headers['x-ratelimit-remaining'] || '0');
    const reset = parseInt(headers['x-ratelimit-reset'] || '0') * 1000; // Convert to ms
    const limit = parseInt(headers['x-ratelimit-limit'] || '0');

    this.rateLimitCache.set('global', {
      remaining,
      reset,
      limit
    });
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = RATE_LIMIT_CONFIG.RETRY_DELAYS[attempt] || 16000;
    const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
    return baseDelay + jitter;
  }

  /**
   * Validate Microsoft Graph configuration
   */
  static validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!MICROSOFT_GRAPH_CONFIG.clientId) {
      errors.push('Microsoft Client ID is not configured');
    }

    if (!MICROSOFT_GRAPH_CONFIG.clientSecret) {
      errors.push('Microsoft Client Secret is not configured');
    }

    if (!MICROSOFT_GRAPH_CONFIG.tenantId) {
      errors.push('Microsoft Tenant ID is not configured');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}