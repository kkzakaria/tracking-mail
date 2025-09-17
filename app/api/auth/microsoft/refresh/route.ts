import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth-service';

/**
 * POST /api/auth/microsoft/refresh
 * Refresh expired access token
 */
export async function POST(request: NextRequest) {
  try {
    // Get user session
    const sessionUserId = request.cookies.get('auth_session')?.value;

    if (!sessionUserId) {
      return NextResponse.json(
        {
          error: 'Not Authenticated',
          message: 'No active session found'
        },
        { status: 401 }
      );
    }

    // Get client information for security logging
    const ipAddress = request.ip ||
                     request.headers.get('x-forwarded-for')?.split(',')[0] ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Attempt to refresh token
    const authService = AuthService.getInstance();
    const result = await authService.refreshToken(sessionUserId, ipAddress, userAgent);

    if (!result.success) {
      // If refresh fails, clear the session
      const response = NextResponse.json(
        {
          error: result.error?.code || 'Refresh Failed',
          message: result.error?.message || 'Failed to refresh authentication token'
        },
        { status: 401 }
      );

      response.cookies.delete('auth_session');
      return response;
    }

    // Return new token information (without exposing actual tokens)
    return NextResponse.json({
      success: true,
      user: result.user,
      expiresAt: result.tokens?.expiresAt,
      message: 'Token refreshed successfully'
    });

  } catch (error) {
    console.error('Error refreshing token:', error);

    // Clear session on error
    const response = NextResponse.json(
      {
        error: 'Refresh Error',
        message: 'An unexpected error occurred while refreshing the token'
      },
      { status: 500 }
    );

    response.cookies.delete('auth_session');
    return response;
  }
}

/**
 * GET /api/auth/microsoft/refresh
 * Check if token needs refresh and get current status
 */
export async function GET(request: NextRequest) {
  try {
    // Get user session
    const sessionUserId = request.cookies.get('auth_session')?.value;

    if (!sessionUserId) {
      return NextResponse.json(
        {
          error: 'Not Authenticated',
          message: 'No active session found'
        },
        { status: 401 }
      );
    }

    // Validate current session
    const authService = AuthService.getInstance();
    const session = await authService.validateSession(sessionUserId);

    if (!session) {
      // Session is invalid or expired
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

    // Calculate time until token expires
    const now = new Date();
    const expiresIn = Math.max(0, session.tokenExpiry.getTime() - now.getTime());
    const expiresInMinutes = Math.floor(expiresIn / (1000 * 60));

    // Check if token needs refresh (less than 5 minutes remaining)
    const needsRefresh = expiresInMinutes < 5;

    return NextResponse.json({
      success: true,
      user: session.user,
      expiresAt: session.tokenExpiry,
      expiresInMinutes,
      needsRefresh,
      hasRefreshToken: !!session.refreshToken
    });

  } catch (error) {
    console.error('Error checking token status:', error);

    return NextResponse.json(
      {
        error: 'Status Check Error',
        message: 'Failed to check authentication status'
      },
      { status: 500 }
    );
  }
}