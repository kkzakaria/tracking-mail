/**
 * API Client utilities for Microsoft Graph integration
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Base API client configuration
 */
export const API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_APP_URL || '',
  timeout: 30000,
  retries: 3
} as const;

/**
 * HTTP status code helpers
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500
} as const;

/**
 * Create API error from response
 */
export function createApiError(
  response: Response,
  data?: any
): ApiResponse {
  const error = {
    code: `HTTP_${response.status}`,
    message: data?.message || response.statusText || 'Unknown error',
    details: data
  };

  return {
    success: false,
    error
  };
}

/**
 * Generic API request function with retry logic
 */
export async function apiRequest<T = any>(
  url: string,
  options: RequestInit = {},
  retries: number = API_CONFIG.retries
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

  const requestOptions: RequestInit = {
    ...options,
    credentials: 'include',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, requestOptions);
      clearTimeout(timeoutId);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        let data: T;

        if (contentType?.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text() as unknown as T;
        }

        return {
          success: true,
          data
        };
      }

      // Handle specific error cases
      if (response.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;

        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      // Parse error response
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: response.statusText };
      }

      return createApiError(response, errorData);

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      // Don't retry on abort (timeout)
      if (lastError.name === 'AbortError') {
        clearTimeout(timeoutId);
        return {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: 'Request timed out'
          }
        };
      }

      // Retry on network errors
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  clearTimeout(timeoutId);

  return {
    success: false,
    error: {
      code: 'NETWORK_ERROR',
      message: lastError?.message || 'Network error occurred'
    }
  };
}

/**
 * GET request helper
 */
export async function apiGet<T = any>(
  endpoint: string,
  params?: Record<string, string | number | boolean>
): Promise<ApiResponse<T>> {
  let url = endpoint;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      searchParams.append(key, value.toString());
    });
    url += `?${searchParams.toString()}`;
  }

  return apiRequest<T>(url, { method: 'GET' });
}

/**
 * POST request helper
 */
export async function apiPost<T = any>(
  endpoint: string,
  data?: any
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined
  });
}

/**
 * PUT request helper
 */
export async function apiPut<T = any>(
  endpoint: string,
  data?: any
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined
  });
}

/**
 * DELETE request helper
 */
export async function apiDelete<T = any>(
  endpoint: string
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, { method: 'DELETE' });
}

/**
 * Authentication API client
 */
export const authApi = {
  /**
   * Get current session
   */
  getSession: () => apiGet<{
    authenticated: boolean;
    user?: any;
    session?: any;
  }>('/api/auth/session'),

  /**
   * Initiate login
   */
  login: () => apiGet<{
    authUrl: string;
    state: string;
  }>('/api/auth/microsoft'),

  /**
   * Logout
   */
  logout: () => apiDelete('/api/auth/session'),

  /**
   * Refresh token
   */
  refresh: () => apiPost('/api/auth/microsoft/refresh'),

  /**
   * Check token status
   */
  checkToken: () => apiGet('/api/auth/microsoft/refresh')
};

/**
 * Microsoft Graph API client
 */
export const graphApi = {
  /**
   * Get all users
   */
  getUsers: (params?: {
    search?: string;
    limit?: number;
    filter?: string;
  }) => apiGet<PaginatedResponse<any>>('/api/graph/users', params),

  /**
   * Get specific user
   */
  getUser: (userId: string) => apiGet<{ user: any }>(`/api/graph/users/${userId}`),

  /**
   * Get user mail
   */
  getUserMail: (userId: string, params?: {
    limit?: number;
    unreadOnly?: boolean;
  }) => apiGet<PaginatedResponse<any>>(`/api/graph/mail/${userId}`, params),

  /**
   * Send mail
   */
  sendMail: (userId: string, emailData: {
    subject: string;
    body: string;
    toRecipients: string[];
    ccRecipients?: string[];
    importance?: 'low' | 'normal' | 'high';
  }) => apiPost<{
    success: boolean;
    messageId: string;
  }>(`/api/graph/mail/${userId}`, emailData),

  /**
   * Get user calendar
   */
  getUserCalendar: (userId: string, params?: {
    limit?: number;
    startDate?: string;
    endDate?: string;
  }) => apiGet<PaginatedResponse<any>>(`/api/graph/calendar/${userId}`, params)
};

/**
 * Helper to handle API responses in components
 */
export function handleApiResponse<T>(
  response: ApiResponse<T>,
  onSuccess: (data: T) => void,
  onError?: (error: { code: string; message: string }) => void
): boolean {
  if (response.success && response.data) {
    onSuccess(response.data);
    return true;
  } else if (response.error) {
    if (onError) {
      onError(response.error);
    } else {
      console.error('API Error:', response.error);
    }
    return false;
  }

  return false;
}

/**
 * Create a typed API client for specific endpoints
 */
export function createApiClient<T extends Record<string, any>>(
  baseEndpoint: string
) {
  return {
    list: (params?: Record<string, any>) =>
      apiGet<PaginatedResponse<T>>(`${baseEndpoint}`, params),

    get: (id: string) =>
      apiGet<T>(`${baseEndpoint}/${id}`),

    create: (data: Partial<T>) =>
      apiPost<T>(`${baseEndpoint}`, data),

    update: (id: string, data: Partial<T>) =>
      apiPut<T>(`${baseEndpoint}/${id}`, data),

    delete: (id: string) =>
      apiDelete<void>(`${baseEndpoint}/${id}`)
  };
}