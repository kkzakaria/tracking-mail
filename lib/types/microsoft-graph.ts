// Types for Microsoft Graph integration

export interface MicrosoftGraphConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
  scopes: string[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
}

export interface StoredTokenData {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token?: string;
  expires_at: string;
  scope: string;
  token_type: string;
  created_at: string;
  updated_at: string;
  is_revoked: boolean;
}

export interface MicrosoftUser {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  department?: string;
  businessPhones?: string[];
  mobilePhone?: string;
}

export interface AuthSession {
  user: MicrosoftUser;
  accessToken: string;
  tokenExpiry: Date;
  refreshToken?: string;
}

export interface LegacyGraphApiError {
  code: string;
  message: string;
  innerError?: {
    code: string;
    message: string;
    date: string;
    'request-id': string;
  };
}

export interface AuthenticationResult {
  success: boolean;
  user?: MicrosoftUser;
  tokens?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: Date;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// Additional types for Microsoft Graph API responses
export interface GraphApiResponse<T = unknown> {
  '@odata.context'?: string;
  '@odata.nextLink'?: string;
  '@odata.count'?: number;
  value: T[];
}

export interface GraphApiUser {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  department?: string;
  businessPhones?: string[];
  mobilePhone?: string;
}

export interface GraphApiMessage {
  id: string;
  subject?: string;
  from?: {
    emailAddress: {
      name?: string;
      address?: string;
    };
  };
  receivedDateTime?: string;
  bodyPreview?: string;
  isRead?: boolean;
}

export interface GraphApiEvent {
  id: string;
  subject?: string;
  start?: {
    dateTime: string;
    timeZone: string;
  };
  end?: {
    dateTime: string;
    timeZone: string;
  };
  organizer?: {
    emailAddress: {
      name?: string;
      address?: string;
    };
  };
  attendees?: Array<{
    emailAddress: {
      name?: string;
      address?: string;
    };
    status: {
      response: string;
    };
  }>;
}

export interface GraphApiError {
  error: {
    code: string;
    message: string;
    innerError?: {
      code: string;
      message: string;
      date: string;
      'request-id': string;
    };
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PermissionScopes {
  // Application permissions (not delegated)
  readonly MAIL_READ_ALL: 'https://graph.microsoft.com/Mail.Read';
  readonly MAIL_READWRITE_ALL: 'https://graph.microsoft.com/Mail.ReadWrite';
  readonly USER_READ_ALL: 'https://graph.microsoft.com/User.Read.All';
  readonly CALENDARS_READ_ALL: 'https://graph.microsoft.com/Calendars.Read';
  readonly DIRECTORY_READ_ALL: 'https://graph.microsoft.com/Directory.Read.All';
}

export interface RateLimitInfo {
  remaining: number;
  reset: number;
  limit: number;
}

export interface GraphRequestOptions {
  retries?: number;
  timeout?: number;
  rateLimitHandling?: boolean;
}

export interface AuthenticationAttempt {
  id: string;
  user_id?: string;
  ip_address: string;
  user_agent: string;
  attempt_type: 'login' | 'refresh' | 'logout';
  success: boolean;
  error_code?: string;
  error_message?: string;
  created_at: string;
}