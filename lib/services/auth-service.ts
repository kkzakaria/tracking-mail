// JWT and NextRequest imports removed as they are not used in this file
import {
  AuthenticationResult,
  StoredTokenData,
  MicrosoftUser,
  AuthSession,
  TokenResponse
} from '../types/microsoft-graph';
import {
  MICROSOFT_GRAPH_CONFIG,
  TOKEN_CONFIG,
  SECURITY_CONFIG
} from '../config/microsoft-graph';
import { encryptToken, decryptToken, generateStateParameter } from '../utils/encryption';
import { TokenStorage, AuthAttemptLogger } from './supabase-client';
import { AdminGraphService } from './admin-graph-service';

/**
 * Authentication Service
 * Handles OAuth flow, token management, and session validation
 */
export class AuthService {
  private static instance: AuthService;
  private graphService: AdminGraphService;

  constructor() {
    this.graphService = AdminGraphService.getInstance();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(state?: string): string {
    const stateParam = state || generateStateParameter();

    const params = new URLSearchParams({
      client_id: MICROSOFT_GRAPH_CONFIG.clientId,
      response_type: 'code',
      redirect_uri: MICROSOFT_GRAPH_CONFIG.redirectUri,
      scope: MICROSOFT_GRAPH_CONFIG.scopes.join(' '),
      state: stateParam,
      response_mode: 'query'
    });

    return `https://login.microsoftonline.com/${MICROSOFT_GRAPH_CONFIG.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    state: string,
    ipAddress: string,
    userAgent: string
  ): Promise<AuthenticationResult> {
    try {
      // Validate state parameter (implement your state validation logic)
      if (!this.validateState(state)) {
        await this.logAuthAttempt({
          attempt_type: 'login',
          success: false,
          error_code: 'INVALID_STATE',
          error_message: 'Invalid state parameter',
          ip_address: ipAddress,
          user_agent: userAgent
        });

        return {
          success: false,
          error: {
            code: 'INVALID_STATE',
            message: 'Invalid state parameter'
          }
        };
      }

      // Exchange code for tokens
      const tokenResponse = await this.requestTokens(code);

      if (!tokenResponse.access_token) {
        await this.logAuthAttempt({
          attempt_type: 'login',
          success: false,
          error_code: 'TOKEN_EXCHANGE_FAILED',
          error_message: 'Failed to exchange code for tokens',
          ip_address: ipAddress,
          user_agent: userAgent
        });

        return {
          success: false,
          error: {
            code: 'TOKEN_EXCHANGE_FAILED',
            message: 'Failed to exchange authorization code for tokens'
          }
        };
      }

      // Get user information
      const userInfo = await this.getUserFromToken(tokenResponse.access_token);

      // Store encrypted tokens
      await this.storeTokens(userInfo.id, tokenResponse);

      await this.logAuthAttempt({
        user_id: userInfo.id,
        attempt_type: 'login',
        success: true,
        ip_address: ipAddress,
        user_agent: userAgent
      });

      return {
        success: true,
        user: userInfo,
        tokens: {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000)
        }
      };

    } catch (error) {
      console.error('Error exchanging code for tokens:', error);

      await this.logAuthAttempt({
        attempt_type: 'login',
        success: false,
        error_code: 'EXCHANGE_ERROR',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        ip_address: ipAddress,
        user_agent: userAgent
      });

      return {
        success: false,
        error: {
          code: 'EXCHANGE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to exchange authorization code'
        }
      };
    }
  }

  /**
   * Request tokens from Microsoft
   */
  private async requestTokens(code: string): Promise<TokenResponse> {
    const tokenEndpoint = `https://login.microsoftonline.com/${MICROSOFT_GRAPH_CONFIG.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: MICROSOFT_GRAPH_CONFIG.clientId,
      client_secret: MICROSOFT_GRAPH_CONFIG.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: MICROSOFT_GRAPH_CONFIG.redirectUri
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Token request failed: ${errorData.error_description || errorData.error}`);
    }

    return response.json();
  }

  /**
   * Get user information from access token
   */
  private async getUserFromToken(accessToken: string): Promise<MicrosoftUser> {
    try {
      const client = await this.graphService.createGraphClient(accessToken);

      const user = await client.api('/me').get();

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
      throw new Error(`Failed to get user information: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store encrypted tokens in database
   */
  private async storeTokens(userId: string, tokenResponse: TokenResponse): Promise<StoredTokenData> {
    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

    const tokenData = {
      user_id: userId,
      access_token: encryptToken(tokenResponse.access_token),
      refresh_token: tokenResponse.refresh_token ? encryptToken(tokenResponse.refresh_token) : undefined,
      expires_at: expiresAt.toISOString(),
      scope: tokenResponse.scope || MICROSOFT_GRAPH_CONFIG.scopes.join(' '),
      token_type: tokenResponse.token_type || 'Bearer',
      is_revoked: false
    };

    // Revoke existing tokens for this user
    await this.revokeUserTokens(userId);

    // Store new token
    return TokenStorage.storeToken(tokenData);
  }

  /**
   * Refresh access token
   */
  async refreshToken(
    userId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<AuthenticationResult> {
    try {
      const storedToken = await TokenStorage.getTokenByUserId(userId);

      if (!storedToken || !storedToken.refresh_token) {
        await this.logAuthAttempt({
          user_id: userId,
          attempt_type: 'refresh',
          success: false,
          error_code: 'NO_REFRESH_TOKEN',
          error_message: 'No refresh token available',
          ip_address: ipAddress,
          user_agent: userAgent
        });

        return {
          success: false,
          error: {
            code: 'NO_REFRESH_TOKEN',
            message: 'No refresh token available'
          }
        };
      }

      const refreshToken = decryptToken(storedToken.refresh_token);
      const newTokenResponse = await this.requestRefreshToken(refreshToken);

      // Update stored token
      await TokenStorage.updateToken(storedToken.id, {
        access_token: encryptToken(newTokenResponse.access_token),
        refresh_token: newTokenResponse.refresh_token ? encryptToken(newTokenResponse.refresh_token) : storedToken.refresh_token,
        expires_at: new Date(Date.now() + newTokenResponse.expires_in * 1000).toISOString(),
        scope: newTokenResponse.scope || storedToken.scope
      });

      // Get updated user info
      const userInfo = await this.getUserFromToken(newTokenResponse.access_token);

      await this.logAuthAttempt({
        user_id: userId,
        attempt_type: 'refresh',
        success: true,
        ip_address: ipAddress,
        user_agent: userAgent
      });

      return {
        success: true,
        user: userInfo,
        tokens: {
          accessToken: newTokenResponse.access_token,
          refreshToken: newTokenResponse.refresh_token,
          expiresAt: new Date(Date.now() + newTokenResponse.expires_in * 1000)
        }
      };

    } catch (error) {
      console.error('Error refreshing token:', error);

      await this.logAuthAttempt({
        user_id: userId,
        attempt_type: 'refresh',
        success: false,
        error_code: 'REFRESH_ERROR',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        ip_address: ipAddress,
        user_agent: userAgent
      });

      return {
        success: false,
        error: {
          code: 'REFRESH_ERROR',
          message: error instanceof Error ? error.message : 'Failed to refresh token'
        }
      };
    }
  }

  /**
   * Request new tokens using refresh token
   */
  private async requestRefreshToken(refreshToken: string): Promise<TokenResponse> {
    const tokenEndpoint = `https://login.microsoftonline.com/${MICROSOFT_GRAPH_CONFIG.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: MICROSOFT_GRAPH_CONFIG.clientId,
      client_secret: MICROSOFT_GRAPH_CONFIG.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Token refresh failed: ${errorData.error_description || errorData.error}`);
    }

    return response.json();
  }

  /**
   * Validate authentication session
   */
  async validateSession(userId: string): Promise<AuthSession | null> {
    try {
      const storedToken = await TokenStorage.getTokenByUserId(userId);

      if (!storedToken || storedToken.is_revoked) {
        return null;
      }

      const expiresAt = new Date(storedToken.expires_at);
      const now = new Date();

      // Check if token is expired
      if (expiresAt <= now) {
        return null;
      }

      // Check if token needs refresh (within threshold)
      const needsRefresh = (expiresAt.getTime() - now.getTime()) < TOKEN_CONFIG.TOKEN_REFRESH_THRESHOLD * 1000;

      if (needsRefresh && storedToken.refresh_token) {
        // Auto-refresh token
        const refreshResult = await this.refreshToken(userId, '', '');
        if (refreshResult.success && refreshResult.user && refreshResult.tokens) {
          return {
            user: refreshResult.user,
            accessToken: refreshResult.tokens.accessToken,
            tokenExpiry: refreshResult.tokens.expiresAt,
            refreshToken: refreshResult.tokens.refreshToken
          };
        }
      }

      // Return current session
      const accessToken = decryptToken(storedToken.access_token);
      const userInfo = await this.getUserFromToken(accessToken);

      return {
        user: userInfo,
        accessToken,
        tokenExpiry: expiresAt,
        refreshToken: storedToken.refresh_token ? decryptToken(storedToken.refresh_token) : undefined
      };

    } catch (error) {
      console.error('Error validating session:', error);
      return null;
    }
  }

  /**
   * Revoke user tokens
   */
  async revokeUserTokens(userId: string): Promise<void> {
    try {
      const tokens = await TokenStorage.getUserTokens(userId);

      for (const token of tokens) {
        if (!token.is_revoked) {
          await TokenStorage.revokeToken(token.id);
        }
      }
    } catch (error) {
      console.error('Error revoking user tokens:', error);
    }
  }

  /**
   * Logout user
   */
  async logout(
    userId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<void> {
    try {
      await this.revokeUserTokens(userId);

      await this.logAuthAttempt({
        user_id: userId,
        attempt_type: 'logout',
        success: true,
        ip_address: ipAddress,
        user_agent: userAgent
      });
    } catch (error) {
      console.error('Error during logout:', error);

      await this.logAuthAttempt({
        user_id: userId,
        attempt_type: 'logout',
        success: false,
        error_code: 'LOGOUT_ERROR',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        ip_address: ipAddress,
        user_agent: userAgent
      });
    }
  }

  /**
   * Validate state parameter
   */
  private validateState(state: string): boolean {
    // Implement your state validation logic
    // This could involve checking against stored states, CSRF tokens, etc.
    return Boolean(state && state.length >= 16);
  }

  /**
   * Log authentication attempt
   */
  private async logAuthAttempt(attempt: Omit<import('../types/microsoft-graph').AuthenticationAttempt, 'id' | 'created_at'>): Promise<void> {
    try {
      await AuthAttemptLogger.logAttempt(attempt);
    } catch (error) {
      console.error('Failed to log auth attempt:', error);
    }
  }

  /**
   * Check rate limiting
   */
  async checkRateLimit(ipAddress: string): Promise<boolean> {
    try {
      const failedAttempts = await AuthAttemptLogger.getRecentFailedAttempts(ipAddress);
      return failedAttempts < SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS;
    } catch (error) {
      console.error('Error checking rate limit:', error);
      return true; // Allow on error
    }
  }

  /**
   * Get logout URL
   */
  getLogoutUrl(postLogoutRedirectUri?: string): string {
    const params = new URLSearchParams();

    if (postLogoutRedirectUri) {
      params.append('post_logout_redirect_uri', postLogoutRedirectUri);
    }

    return `https://login.microsoftonline.com/${MICROSOFT_GRAPH_CONFIG.tenantId}/oauth2/v2.0/logout?${params.toString()}`;
  }
}