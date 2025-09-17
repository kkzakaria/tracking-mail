import { MicrosoftGraphConfig, PermissionScopes } from '../types/microsoft-graph';

// Microsoft Graph configuration
export const MICROSOFT_GRAPH_CONFIG: MicrosoftGraphConfig = {
  clientId: process.env.MICROSOFT_CLIENT_ID || '',
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
  tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
  redirectUri: process.env.MICROSOFT_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/microsoft/callback`,
  scopes: [
    'https://graph.microsoft.com/.default' // For application permissions
  ]
};

// Microsoft Graph endpoints
export const GRAPH_ENDPOINTS = {
  TOKEN: `https://login.microsoftonline.com/${MICROSOFT_GRAPH_CONFIG.tenantId}/oauth2/v2.0/token`,
  AUTHORIZE: `https://login.microsoftonline.com/${MICROSOFT_GRAPH_CONFIG.tenantId}/oauth2/v2.0/authorize`,
  GRAPH_API: 'https://graph.microsoft.com/v1.0',
  LOGOUT: `https://login.microsoftonline.com/${MICROSOFT_GRAPH_CONFIG.tenantId}/oauth2/v2.0/logout`
} as const;

// Application permissions (not delegated)
export const PERMISSION_SCOPES: PermissionScopes = {
  MAIL_READ_ALL: 'https://graph.microsoft.com/Mail.Read',
  MAIL_READWRITE_ALL: 'https://graph.microsoft.com/Mail.ReadWrite',
  USER_READ_ALL: 'https://graph.microsoft.com/User.Read.All',
  CALENDARS_READ_ALL: 'https://graph.microsoft.com/Calendars.Read',
  DIRECTORY_READ_ALL: 'https://graph.microsoft.com/Directory.Read.All'
} as const;

// Rate limiting configuration
export const RATE_LIMIT_CONFIG = {
  MAX_REQUESTS_PER_MINUTE: 60,
  MAX_REQUESTS_PER_HOUR: 3600,
  BURST_LIMIT: 10,
  RETRY_DELAYS: [1000, 2000, 4000, 8000, 16000] // Exponential backoff in ms
} as const;

// Token configuration
export const TOKEN_CONFIG = {
  ACCESS_TOKEN_LIFETIME: 3600, // 1 hour in seconds
  REFRESH_TOKEN_LIFETIME: 86400 * 30, // 30 days in seconds
  TOKEN_REFRESH_THRESHOLD: 300, // Refresh when 5 minutes left
  ENCRYPTION_ALGORITHM: 'aes-256-gcm',
  TOKEN_CLEANUP_INTERVAL: 86400 * 1000 // 24 hours in ms
} as const;

// Security configuration
export const SECURITY_CONFIG = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 900000, // 15 minutes in ms
  SESSION_TIMEOUT: 86400000, // 24 hours in ms
  CSRF_TOKEN_LENGTH: 32,
  STATE_PARAMETER_LENGTH: 32
} as const;

// Validation functions
export function validateMicrosoftGraphConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!MICROSOFT_GRAPH_CONFIG.clientId) {
    errors.push('MICROSOFT_CLIENT_ID environment variable is required');
  }

  if (!MICROSOFT_GRAPH_CONFIG.clientSecret) {
    errors.push('MICROSOFT_CLIENT_SECRET environment variable is required');
  }

  if (!MICROSOFT_GRAPH_CONFIG.redirectUri) {
    errors.push('MICROSOFT_REDIRECT_URI environment variable is required');
  }

  if (!process.env.NEXT_PUBLIC_APP_URL) {
    errors.push('NEXT_PUBLIC_APP_URL environment variable is required');
  }

  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
    errors.push('ENCRYPTION_KEY environment variable must be at least 32 characters');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Environment variables validation
export function getRequiredEnvVars(): Record<string, string> {
  return {
    MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID || '',
    MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET || '',
    MICROSOFT_TENANT_ID: process.env.MICROSOFT_TENANT_ID || 'common',
    MICROSOFT_REDIRECT_URI: process.env.MICROSOFT_REDIRECT_URI || '',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || '',
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  };
}