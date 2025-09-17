import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '../services/auth-service';

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: string;
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
  };
  accessToken?: string;
}

/**
 * Authentication middleware for API routes
 * Validates session and adds user context to request
 */
export async function withAuth(
  request: NextRequest,
  handler: (req: AuthenticatedRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    // Get session from cookie
    const sessionUserId = request.cookies.get('auth_session')?.value;

    if (!sessionUserId) {
      return NextResponse.json(
        {
          error: 'Not Authenticated',
          message: 'Authentication required'
        },
        { status: 401 }
      );
    }

    // Validate session
    const authService = AuthService.getInstance();
    const session = await authService.validateSession(sessionUserId);

    if (!session) {
      const response = NextResponse.json(
        {
          error: 'Session Expired',
          message: 'Authentication session has expired'
        },
        { status: 401 }
      );

      response.cookies.delete('auth_session');
      return response;
    }

    // Add user context to request
    const authenticatedRequest = request as AuthenticatedRequest;
    authenticatedRequest.user = session.user;
    authenticatedRequest.accessToken = session.accessToken;

    // Call the handler with authenticated request
    return await handler(authenticatedRequest);

  } catch (error) {
    console.error('Authentication middleware error:', error);

    return NextResponse.json(
      {
        error: 'Authentication Error',
        message: 'Failed to validate authentication'
      },
      { status: 500 }
    );
  }
}

/**
 * Optional authentication middleware
 * Adds user context if authenticated, but doesn't require it
 */
export async function withOptionalAuth(
  request: NextRequest,
  handler: (req: AuthenticatedRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    // Get session from cookie
    const sessionUserId = request.cookies.get('auth_session')?.value;

    if (sessionUserId) {
      // Try to validate session
      const authService = AuthService.getInstance();
      const session = await authService.validateSession(sessionUserId);

      if (session) {
        // Add user context to request
        const authenticatedRequest = request as AuthenticatedRequest;
        authenticatedRequest.user = session.user;
        authenticatedRequest.accessToken = session.accessToken;
      }
    }

    // Call handler regardless of authentication status
    return await handler(request as AuthenticatedRequest);

  } catch (error) {
    console.error('Optional authentication middleware error:', error);

    // Continue without authentication on error
    return await handler(request as AuthenticatedRequest);
  }
}

/**
 * Rate limiting middleware
 */
export async function withRateLimit(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: {
    maxRequests?: number;
    windowMs?: number;
    keyGenerator?: (req: NextRequest) => string;
  } = {}
): Promise<NextResponse> {
  const {
    windowMs = 60000, // 1 minute
    keyGenerator = (req) => req.ip || 'unknown'
  } = options;

  try {
    const _key = keyGenerator(request);

    // In a production environment, you would use Redis or another store
    // For now, we'll use a simple in-memory store (not recommended for production)
    const now = Date.now();
    const _windowStart = now - windowMs;

    // This would be replaced with proper rate limiting storage
    // For demonstration purposes only

    return await handler(request);

  } catch (error) {
    console.error('Rate limiting middleware error:', error);
    return await handler(request);
  }
}

/**
 * CORS middleware for API routes
 */
export function withCORS(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: {
    origin?: string | string[];
    methods?: string[];
    allowedHeaders?: string[];
  } = {}
): Promise<NextResponse> {
  const {
    origin = process.env.NEXT_PUBLIC_APP_URL || '*',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization', 'X-Requested-With']
  } = options;

  return handler(request).then(response => {
    // Add CORS headers
    response.headers.set('Access-Control-Allow-Origin', Array.isArray(origin) ? origin.join(', ') : origin);
    response.headers.set('Access-Control-Allow-Methods', methods.join(', '));
    response.headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    response.headers.set('Access-Control-Max-Age', '86400');

    return response;
  });
}

/**
 * Security headers middleware
 */
export function withSecurityHeaders(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  return handler(request).then(response => {
    // Add security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    );

    return response;
  });
}

/**
 * Logging middleware
 */
export async function withLogging(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  const start = Date.now();
  const method = request.method;
  const url = request.url;
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';

  try {
    const response = await handler(request);
    const duration = Date.now() - start;
    const status = response.status;

    console.log(`${method} ${url} ${status} ${duration}ms - ${ip} - ${userAgent}`);

    return response;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`${method} ${url} ERROR ${duration}ms - ${ip} - ${userAgent}:`, error);
    throw error;
  }
}

/**
 * Compose multiple middleware functions
 */
export function compose(
  ...middlewares: Array<(req: NextRequest, next: (req: NextRequest) => Promise<NextResponse>) => Promise<NextResponse>>
) {
  return (request: NextRequest, handler: (req: NextRequest) => Promise<NextResponse>) => {
    return middlewares.reduceRight(
      (next, middleware) => (req: NextRequest) => middleware(req, next),
      handler
    )(request);
  };
}