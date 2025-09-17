/**
 * Hook React pour l'accès aux boîtes emails assignées (utilisateurs finaux)
 * Séparé de Microsoft Graph - utilise uniquement l'authentification Supabase
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/utils/supabase/client';
import type { User } from '@supabase/supabase-js';

// Types pour les boîtes emails utilisateur
interface UserMailbox {
  id: string;
  permission_level: 'read' | 'read_write' | 'admin';
  assigned_at: string;
  expires_at: string | null;
  notes: string | null;
  mailboxes: {
    id: string;
    email_address: string;
    display_name: string | null;
    description: string | null;
    mailbox_type: string;
    is_active: boolean;
    sync_enabled: boolean;
    last_sync_at: string | null;
    sync_status: 'pending' | 'syncing' | 'completed' | 'error';
    sync_error: string | null;
  };
  messages?: EmailMessage[];
  messagesError?: string | null;
}

interface EmailMessage {
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
  importance?: 'low' | 'normal' | 'high';
}

interface UserMailboxesState {
  mailboxes: UserMailbox[];
  loading: boolean;
  error: string | null;
  graphConfigured: boolean;
  user: {
    id: string;
    email: string;
    displayName: string;
  } | null;
}

interface UseUserMailboxesResult extends UserMailboxesState {
  refreshMailboxes: (options?: {
    includeMessages?: boolean;
    messageLimit?: number;
    unreadOnly?: boolean;
  }) => Promise<void>;
  getMailboxMessages: (mailboxId: string, options?: {
    limit?: number;
    unreadOnly?: boolean;
    page?: number;
  }) => Promise<{
    success: boolean;
    messages?: EmailMessage[];
    mailbox?: {
      id: string;
      emailAddress: string;
      displayName: string | null;
      syncStatus: string;
      syncEnabled: boolean;
    };
    pagination?: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
    permission?: string;
    error?: string;
  }>;
  reset: () => void;
}

/**
 * Hook principal pour l'accès aux boîtes emails assignées
 */
export function useUserMailboxes(): UseUserMailboxesResult {
  const [state, setState] = useState<UserMailboxesState>({
    mailboxes: [],
    loading: false,
    error: null,
    graphConfigured: false,
    user: null
  });

  /**
   * Rafraîchir la liste des boîtes emails assignées
   */
  const refreshMailboxes = useCallback(async (options?: {
    includeMessages?: boolean;
    messageLimit?: number;
    unreadOnly?: boolean;
  }) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const params = new URLSearchParams();
      if (options?.includeMessages) params.append('includeMessages', 'true');
      if (options?.messageLimit) params.append('messageLimit', options.messageLimit.toString());
      if (options?.unreadOnly) params.append('unreadOnly', 'true');

      const response = await fetch(`/api/user/my-mailboxes?${params.toString()}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setState(prev => ({
          ...prev,
          loading: false,
          mailboxes: result.data.mailboxes || [],
          graphConfigured: result.data.graphConfigured || false,
          user: result.data.user || null,
          error: null
        }));
      } else {
        throw new Error(result.message || 'Erreur lors de la récupération des boîtes emails');
      }

    } catch (error) {
      console.error('Error refreshing mailboxes:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      }));
    }
  }, []);

  /**
   * Obtenir les messages d'une boîte email spécifique
   */
  const getMailboxMessages = useCallback(async (
    mailboxId: string,
    options?: {
      limit?: number;
      unreadOnly?: boolean;
      page?: number;
    }
  ) => {
    try {
      const params = new URLSearchParams();
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.unreadOnly) params.append('unreadOnly', 'true');
      if (options?.page) params.append('page', options.page.toString());

      const response = await fetch(`/api/user/mailbox/${mailboxId}/messages?${params.toString()}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.message || `HTTP ${response.status}`
        };
      }

      const result = await response.json();

      if (result.success) {
        return {
          success: true,
          messages: result.data.messages,
          mailbox: result.data.mailbox,
          pagination: result.data.pagination,
          permission: result.data.permission
        };
      } else {
        return {
          success: false,
          error: result.message || 'Erreur lors de la récupération des messages'
        };
      }

    } catch (error) {
      console.error('Error getting mailbox messages:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      };
    }
  }, []);

  /**
   * Réinitialiser l'état
   */
  const reset = useCallback(() => {
    setState({
      mailboxes: [],
      loading: false,
      error: null,
      graphConfigured: false,
      user: null
    });
  }, []);

  return {
    ...state,
    refreshMailboxes,
    getMailboxMessages,
    reset
  };
}

/**
 * Hook pour obtenir l'utilisateur Supabase actuel
 */
export function useSupabaseUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('🔍 useSupabaseUser: Initializing');
    const supabase = createClient();

    // Obtenir l'utilisateur actuel
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      console.log('🔍 useSupabaseUser: getUser result', { user: !!user, userId: user?.id, error });
      setUser(user);
      setLoading(false);
    });

    // Écouter les changements d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('🔍 useSupabaseUser: Auth state changed', {
          event,
          user: !!session?.user,
          userId: session?.user?.id
        });
        setUser(session?.user || null);
        setLoading(false);
      }
    );

    return () => {
      console.log('🔍 useSupabaseUser: Cleanup');
      subscription.unsubscribe();
    };
  }, []);

  console.log('🔍 useSupabaseUser: Current state', {
    user: !!user,
    userId: user?.id,
    loading
  });

  return { user, loading };
}

/**
 * Hook pour l'authentification Supabase simplifié
 */
export function useSupabaseAuth() {
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: userLoading } = useSupabaseUser();

  const signIn = useCallback(async (email: string, password: string) => {
    console.log('🔐 useSupabaseAuth: Starting signIn', { email });
    setActionLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.log('🔐 useSupabaseAuth: SignIn error', error);
        throw error;
      }
      console.log('🔐 useSupabaseAuth: SignIn success');
    } catch (error) {
      console.log('🔐 useSupabaseAuth: SignIn catch error', error);
      setError(error instanceof Error ? error.message : 'Erreur de connexion');
    } finally {
      setActionLoading(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, metadata?: {
    full_name?: string;
    display_name?: string;
  }) => {
    console.log('🔐 useSupabaseAuth: Starting signUp', { email });
    setActionLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata || {}
        }
      });

      if (error) throw error;
      console.log('🔐 useSupabaseAuth: SignUp success');
    } catch (error) {
      console.log('🔐 useSupabaseAuth: SignUp error', error);
      setError(error instanceof Error ? error.message : 'Erreur d\'inscription');
    } finally {
      setActionLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    console.log('🔐 useSupabaseAuth: Starting signOut');
    setActionLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) throw error;
      console.log('🔐 useSupabaseAuth: SignOut success');
    } catch (error) {
      console.log('🔐 useSupabaseAuth: SignOut error', error);
      setError(error instanceof Error ? error.message : 'Erreur de déconnexion');
    } finally {
      setActionLoading(false);
    }
  }, []);

  const isAuthenticated = !!user;
  const totalLoading = userLoading || actionLoading;

  console.log('🔐 useSupabaseAuth: Current state', {
    user: !!user,
    userId: user?.id,
    userLoading,
    actionLoading,
    totalLoading,
    isAuthenticated,
    error
  });

  return {
    user,
    loading: totalLoading,
    error,
    signIn,
    signUp,
    signOut,
    isAuthenticated
  };
}