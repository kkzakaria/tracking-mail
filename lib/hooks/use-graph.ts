'use client';

import { useState, useCallback } from 'react';
import { MicrosoftUser, GraphApiMessage, GraphApiEvent } from '../types/microsoft-graph';

interface UseGraphOptions {
  autoRefresh?: boolean;
  retries?: number;
}

interface GraphState<T> {
  data?: T;
  loading: boolean;
  error?: string;
}

interface GraphActions<T, TArgs extends unknown[] = unknown[]> {
  execute: (...args: TArgs) => Promise<T | undefined>;
  refresh: () => Promise<T | undefined>;
  reset: () => void;
}

/**
 * Generic hook for Microsoft Graph API calls
 */
export function useGraph<T, TArgs extends unknown[] = unknown[]>(
  apiCall: (...args: TArgs) => Promise<Response>,
  options: UseGraphOptions = {}
): GraphState<T> & GraphActions<T, TArgs> {
  const { retries = 3 } = options;
  const [state, setState] = useState<GraphState<T>>({
    loading: false
  });
  const [lastArgs, setLastArgs] = useState<TArgs>(() => [] as unknown as TArgs);

  const execute = useCallback(async (...args: TArgs): Promise<T | undefined> => {
    setState(prev => ({ ...prev, loading: true, error: undefined }));
    setLastArgs(args);

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await apiCall(...args);

        if (response.ok) {
          const data = await response.json();
          setState({ data: data, loading: false });
          return data;
        } else {
          const errorData = await response.json();

          // Handle authentication errors
          if (response.status === 401) {
            setState({
              loading: false,
              error: 'Authentication required. Please login again.'
            });
            return undefined;
          }

          // Handle rate limiting
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;

            if (attempt < retries - 1) {
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }

          lastError = new Error(errorData.message || `HTTP ${response.status}`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Network error');

        if (attempt < retries - 1) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    setState({
      loading: false,
      error: lastError?.message || 'Unknown error occurred'
    });

    return undefined;
  }, [apiCall, retries]);

  const refresh = useCallback(async (): Promise<T | undefined> => {
    return execute(...lastArgs);
  }, [execute, lastArgs]);

  const reset = useCallback(() => {
    setState({ loading: false });
    setLastArgs([] as unknown as TArgs);
  }, []);

  return {
    ...state,
    execute,
    refresh,
    reset
  };
}

/**
 * Hook for fetching users
 */
export function useUsers(options: UseGraphOptions = {}) {
  const apiCall = useCallback(async (searchParams?: {
    search?: string;
    limit?: number;
    filter?: string;
  }) => {
    const params = new URLSearchParams();
    if (searchParams?.search) params.append('search', searchParams.search);
    if (searchParams?.limit) params.append('limit', searchParams.limit.toString());
    if (searchParams?.filter) params.append('filter', searchParams.filter);

    return fetch(`/api/graph/users?${params.toString()}`, {
      credentials: 'include'
    });
  }, []);

  return useGraph<{ users: MicrosoftUser[]; total: number; hasMore: boolean }, [searchParams?: { search?: string; limit?: number; filter?: string; }]>(apiCall, options);
}

/**
 * Hook for fetching a specific user
 */
export function useUser(userId?: string, options: UseGraphOptions = {}) {
  const apiCall = useCallback(async (id: string) => {
    return fetch(`/api/graph/users/${id}`, {
      credentials: 'include'
    });
  }, []);

  const result = useGraph<{ user: MicrosoftUser }, [id: string]>(apiCall, options);

  const executeWithId = useCallback(async () => {
    if (userId) {
      return result.execute(userId);
    }
  }, [userId, result]);

  return {
    ...result,
    execute: executeWithId
  };
}

/**
 * Hook for fetching user mail
 */
export function useUserMail(userId?: string, options: UseGraphOptions = {}) {
  const apiCall = useCallback(async (id: string, mailParams?: {
    limit?: number;
    unreadOnly?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (mailParams?.limit) params.append('limit', mailParams.limit.toString());
    if (mailParams?.unreadOnly) params.append('unreadOnly', 'true');

    return fetch(`/api/graph/mail/${id}?${params.toString()}`, {
      credentials: 'include'
    });
  }, []);

  const result = useGraph<{
    messages: GraphApiMessage[];
    total: number;
    hasMore: boolean;
    unreadOnly: boolean;
  }, [id: string, mailParams?: { limit?: number; unreadOnly?: boolean; }]>(apiCall, options);

  const executeWithParams = useCallback(async (mailParams?: {
    limit?: number;
    unreadOnly?: boolean;
  }) => {
    if (userId) {
      return result.execute(userId, mailParams);
    }
  }, [userId, result]);

  return {
    ...result,
    execute: executeWithParams
  };
}

/**
 * Hook for sending mail
 */
export function useSendMail() {
  const apiCall = useCallback(async (userId: string, emailData: {
    subject: string;
    body: string;
    toRecipients: string[];
    ccRecipients?: string[];
    importance?: 'low' | 'normal' | 'high';
  }) => {
    return fetch(`/api/graph/mail/${userId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(emailData)
    });
  }, []);

  return useGraph<{ success: boolean; messageId: string }, [userId: string, emailData: { subject: string; body: string; toRecipients: string[]; ccRecipients?: string[]; importance?: 'low' | 'normal' | 'high'; }]>(apiCall);
}

/**
 * Hook for fetching user calendar
 */
export function useUserCalendar(userId?: string, options: UseGraphOptions = {}) {
  const apiCall = useCallback(async (id: string, calendarParams?: {
    limit?: number;
    startDate?: string;
    endDate?: string;
  }) => {
    const params = new URLSearchParams();
    if (calendarParams?.limit) params.append('limit', calendarParams.limit.toString());
    if (calendarParams?.startDate) params.append('startDate', calendarParams.startDate);
    if (calendarParams?.endDate) params.append('endDate', calendarParams.endDate);

    return fetch(`/api/graph/calendar/${id}?${params.toString()}`, {
      credentials: 'include'
    });
  }, []);

  const result = useGraph<{
    events: GraphApiEvent[];
    total: number;
    hasMore: boolean;
    dateRange: {
      startDate?: string;
      endDate?: string;
    };
  }, [id: string, calendarParams?: { limit?: number; startDate?: string; endDate?: string; }]>(apiCall, options);

  const executeWithParams = useCallback(async (calendarParams?: {
    limit?: number;
    startDate?: string;
    endDate?: string;
  }) => {
    if (userId) {
      return result.execute(userId, calendarParams);
    }
  }, [userId, result]);

  return {
    ...result,
    execute: executeWithParams
  };
}

/**
 * Hook for batch operations
 */
export function useBatchGraph() {
  const [operations, setOperations] = useState<Array<{
    id: string;
    request: () => Promise<Response>;
    state: GraphState<unknown>;
  }>>([]);

  const addOperation = useCallback((id: string, request: () => Promise<Response>) => {
    setOperations(prev => [
      ...prev,
      {
        id,
        request,
        state: { loading: false }
      }
    ]);
  }, []);

  const removeOperation = useCallback((id: string) => {
    setOperations(prev => prev.filter(op => op.id !== id));
  }, []);

  const executeAll = useCallback(async () => {
    setOperations(prev => prev.map(op => ({
      ...op,
      state: { ...op.state, loading: true, error: undefined }
    })));

    const results = await Promise.allSettled(
      operations.map(async (op) => {
        try {
          const response = await op.request();
          if (response.ok) {
            const data = await response.json();
            return { id: op.id, data, error: undefined };
          } else {
            const errorData = await response.json();
            return { id: op.id, data: undefined, error: errorData.message };
          }
        } catch (error) {
          return {
            id: op.id,
            data: undefined,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    setOperations(prev => prev.map(op => {
      const result = results.find(r => r.status === 'fulfilled' && r.value.id === op.id);
      if (result && result.status === 'fulfilled') {
        return {
          ...op,
          state: {
            data: result.value.data,
            loading: false,
            error: result.value.error
          }
        };
      }
      return {
        ...op,
        state: {
          ...op.state,
          loading: false,
          error: 'Operation failed'
        }
      };
    }));

    return results;
  }, [operations]);

  const reset = useCallback(() => {
    setOperations([]);
  }, []);

  return {
    operations,
    addOperation,
    removeOperation,
    executeAll,
    reset
  };
}