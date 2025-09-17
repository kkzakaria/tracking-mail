import { createClient } from '@supabase/supabase-js';
import { StoredTokenData, AuthenticationAttempt } from '../types/microsoft-graph';

// Regular client for client-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for server-side operations (bypasses RLS)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Database table names
export const TABLES = {
  MICROSOFT_TOKENS: 'microsoft_tokens',
  AUTH_ATTEMPTS: 'auth_attempts',
  USERS: 'users',
  USER_SESSIONS: 'user_sessions'
} as const;

/**
 * Token storage operations
 */
export class TokenStorage {
  /**
   * Store encrypted token data
   */
  static async storeToken(tokenData: Omit<StoredTokenData, 'id' | 'created_at' | 'updated_at'>): Promise<StoredTokenData> {
    const { data, error } = await supabaseAdmin
      .from(TABLES.MICROSOFT_TOKENS)
      .insert([{
        ...tokenData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to store token: ${error.message}`);
    }

    return data;
  }

  /**
   * Retrieve token by user ID
   */
  static async getTokenByUserId(userId: string): Promise<StoredTokenData | null> {
    const { data, error } = await supabaseAdmin
      .from(TABLES.MICROSOFT_TOKENS)
      .select('*')
      .eq('user_id', userId)
      .eq('is_revoked', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to retrieve token: ${error.message}`);
    }

    return data;
  }

  /**
   * Update token data
   */
  static async updateToken(
    tokenId: string,
    updates: Partial<Pick<StoredTokenData, 'access_token' | 'refresh_token' | 'expires_at' | 'scope'>>
  ): Promise<StoredTokenData> {
    const { data, error } = await supabaseAdmin
      .from(TABLES.MICROSOFT_TOKENS)
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', tokenId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update token: ${error.message}`);
    }

    return data;
  }

  /**
   * Revoke token
   */
  static async revokeToken(tokenId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLES.MICROSOFT_TOKENS)
      .update({
        is_revoked: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', tokenId);

    if (error) {
      throw new Error(`Failed to revoke token: ${error.message}`);
    }
  }

  /**
   * Cleanup expired tokens
   */
  static async cleanupExpiredTokens(): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from(TABLES.MICROSOFT_TOKENS)
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      throw new Error(`Failed to cleanup expired tokens: ${error.message}`);
    }

    return data?.length || 0;
  }

  /**
   * Get all tokens for a user
   */
  static async getUserTokens(userId: string): Promise<StoredTokenData[]> {
    const { data, error } = await supabaseAdmin
      .from(TABLES.MICROSOFT_TOKENS)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to retrieve user tokens: ${error.message}`);
    }

    return data || [];
  }
}

/**
 * Authentication attempt logging
 */
export class AuthAttemptLogger {
  /**
   * Log authentication attempt
   */
  static async logAttempt(attempt: Omit<AuthenticationAttempt, 'id' | 'created_at'>): Promise<void> {
    const { error } = await supabaseAdmin
      .from(TABLES.AUTH_ATTEMPTS)
      .insert([{
        ...attempt,
        created_at: new Date().toISOString()
      }]);

    if (error) {
      console.error('Failed to log auth attempt:', error);
      // Don't throw error for logging failures
    }
  }

  /**
   * Get recent failed attempts for rate limiting
   */
  static async getRecentFailedAttempts(
    ipAddress: string,
    timeWindowMinutes: number = 15
  ): Promise<number> {
    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from(TABLES.AUTH_ATTEMPTS)
      .select('id')
      .eq('ip_address', ipAddress)
      .eq('success', false)
      .gte('created_at', since);

    if (error) {
      console.error('Failed to get recent failed attempts:', error);
      return 0;
    }

    return data?.length || 0;
  }

  /**
   * Clear old authentication attempts
   */
  static async cleanupOldAttempts(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from(TABLES.AUTH_ATTEMPTS)
      .delete()
      .lt('created_at', cutoffDate)
      .select('id');

    if (error) {
      throw new Error(`Failed to cleanup old auth attempts: ${error.message}`);
    }

    return data?.length || 0;
  }
}

/**
 * Database health check
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from(TABLES.MICROSOFT_TOKENS)
      .select('id')
      .limit(1);

    return !error;
  } catch {
    return false;
  }
}