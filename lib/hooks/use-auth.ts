'use client';

import { useState, useEffect, useCallback } from 'react';
import { MicrosoftUser } from '../types/microsoft-graph';

interface AuthSession {
  authenticated: boolean;
  user?: MicrosoftUser;
  session?: {
    expiresAt: string;
    expiresInMinutes: number;
    needsRefresh: boolean;
    hasRefreshToken: boolean;
  };
  loading: boolean;
  error?: string;
}

interface AuthActions {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  checkSession: () => Promise<void>;
}

export function useAuth(): AuthSession & AuthActions {
  const [session, setSession] = useState<AuthSession>({
    authenticated: false,
    loading: true
  });

  /**
   * Check current authentication session
   */
  const checkSession = useCallback(async () => {
    try {
      setSession(prev => ({ ...prev, loading: true, error: undefined }));

      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();

        if (data.authenticated) {
          setSession({
            authenticated: true,
            user: data.user,
            session: data.session,
            loading: false
          });
        } else {
          setSession({
            authenticated: false,
            loading: false
          });
        }
      } else {
        setSession({
          authenticated: false,
          loading: false,
          error: 'Failed to check session'
        });
      }
    } catch (error) {
      console.error('Error checking session:', error);
      setSession({
        authenticated: false,
        loading: false,
        error: 'Session check failed'
      });
    }
  }, []);

  /**
   * Initiate login flow
   */
  const login = useCallback(async () => {
    try {
      setSession(prev => ({ ...prev, loading: true, error: undefined }));

      // Get authorization URL
      const response = await fetch('/api/auth/microsoft', {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        // Redirect to Microsoft OAuth
        window.location.href = data.authUrl;
      } else {
        const errorData = await response.json();
        setSession(prev => ({
          ...prev,
          loading: false,
          error: errorData.message || 'Failed to initiate login'
        }));
      }
    } catch (error) {
      console.error('Error initiating login:', error);
      setSession(prev => ({
        ...prev,
        loading: false,
        error: 'Login initiation failed'
      }));
    }
  }, []);

  /**
   * Logout user
   */
  const logout = useCallback(async () => {
    try {
      setSession(prev => ({ ...prev, loading: true, error: undefined }));

      const response = await fetch('/api/auth/session', {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        setSession({
          authenticated: false,
          loading: false
        });

        // Optionally redirect to Microsoft logout
        const data = await response.json();
        if (data.logoutUrl) {
          window.location.href = data.logoutUrl;
        }
      } else {
        const errorData = await response.json();
        setSession(prev => ({
          ...prev,
          loading: false,
          error: errorData.message || 'Failed to logout'
        }));
      }
    } catch (error) {
      console.error('Error during logout:', error);
      setSession({
        authenticated: false,
        loading: false,
        error: 'Logout failed'
      });
    }
  }, []);

  /**
   * Refresh authentication token
   */
  const refresh = useCallback(async () => {
    try {
      setSession(prev => ({ ...prev, loading: true, error: undefined }));

      const response = await fetch('/api/auth/microsoft/refresh', {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setSession({
          authenticated: true,
          user: data.user,
          session: {
            expiresAt: data.expiresAt,
            expiresInMinutes: Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / (1000 * 60)),
            needsRefresh: false,
            hasRefreshToken: true
          },
          loading: false
        });
      } else {
        // Refresh failed, user needs to re-authenticate
        setSession({
          authenticated: false,
          loading: false,
          error: 'Session expired, please login again'
        });
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
      setSession({
        authenticated: false,
        loading: false,
        error: 'Token refresh failed'
      });
    }
  }, []);

  // Check session on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Auto-refresh token when needed
  useEffect(() => {
    if (session.authenticated && session.session?.needsRefresh) {
      const timer = setTimeout(() => {
        refresh();
      }, 60000); // Refresh after 1 minute

      return () => clearTimeout(timer);
    }
  }, [session.authenticated, session.session?.needsRefresh, refresh]);

  // Periodic session check
  useEffect(() => {
    if (session.authenticated) {
      const interval = setInterval(() => {
        checkSession();
      }, 300000); // Check every 5 minutes

      return () => clearInterval(interval);
    }
  }, [session.authenticated, checkSession]);

  return {
    ...session,
    login,
    logout,
    refresh,
    checkSession
  };
}