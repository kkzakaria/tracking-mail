import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth-service';

/**
 * GET /api/auth/session
 * Get current authentication session information
 */
export async function GET(request: NextRequest) {
  try {
    // Get user session from cookie
    const sessionUserId = request.cookies.get('auth_session')?.value;

    if (!sessionUserId) {
      return NextResponse.json(
        {
          authenticated: false,
          message: 'No active session found'
        },
        { status: 200 }
      );
    }

    // Validate and get session details
    const authService = AuthService.getInstance();
    const session = await authService.validateSession(sessionUserId);

    if (!session) {
      // Session is invalid or expired - clear the cookie
      const response = NextResponse.json(
        {
          authenticated: false,
          message: 'Session expired or invalid'
        },
        { status: 200 }
      );

      response.cookies.delete('auth_session');
      return response;
    }

    // Calculate session timing information
    const now = new Date();
    const expiresIn = Math.max(0, session.tokenExpiry.getTime() - now.getTime());
    const expiresInMinutes = Math.floor(expiresIn / (1000 * 60));

    // Return session information (without sensitive tokens)
    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.user.id,
        displayName: session.user.displayName,
        mail: session.user.mail,
        userPrincipalName: session.user.userPrincipalName,
        givenName: session.user.givenName,
        surname: session.user.surname,
        jobTitle: session.user.jobTitle,
        department: session.user.department
      },
      session: {
        expiresAt: session.tokenExpiry,
        expiresInMinutes,
        needsRefresh: expiresInMinutes < 5,
        hasRefreshToken: !!session.refreshToken
      }
    });

  } catch (error) {
    console.error('Error getting session:', error);

    return NextResponse.json(
      {
        authenticated: false,
        error: 'Session Error',
        message: 'Failed to retrieve session information'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/session
 * Clear current session (local logout)
 */
export async function DELETE(request: NextRequest) {
  try {
    // Get user session
    const sessionUserId = request.cookies.get('auth_session')?.value;

    if (sessionUserId) {
      // Get client information for security logging
      const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                       request.headers.get('x-real-ip') ||
                       'unknown';

      const userAgent = request.headers.get('user-agent') || 'unknown';

      // Logout user (revoke tokens)
      const authService = AuthService.getInstance();
      await authService.logout(sessionUserId, ipAddress, userAgent);
    }

    // Clear session cookie
    const response = NextResponse.json({
      success: true,
      message: 'Session cleared successfully'
    });

    response.cookies.delete('auth_session');
    return response;

  } catch (error) {
    console.error('Error clearing session:', error);

    // Still clear the cookie even if there's an error
    const response = NextResponse.json(
      {
        error: 'Logout Error',
        message: 'Failed to clear session properly'
      },
      { status: 500 }
    );

    response.cookies.delete('auth_session');
    return response;
  }
}

/**
 * PUT /api/auth/session
 * Extend or refresh current session
 */
export async function PUT(request: NextRequest) {
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

    // Get client information
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Validate current session
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

    // Check if token needs refresh
    const now = new Date();
    const expiresIn = Math.max(0, session.tokenExpiry.getTime() - now.getTime());
    const expiresInMinutes = Math.floor(expiresIn / (1000 * 60));

    if (expiresInMinutes < 5 && session.refreshToken) {
      // Attempt to refresh token
      const refreshResult = await authService.refreshToken(sessionUserId, ipAddress, userAgent);

      if (refreshResult.success && refreshResult.user && refreshResult.tokens) {
        return NextResponse.json({
          success: true,
          refreshed: true,
          user: refreshResult.user,
          session: {
            expiresAt: refreshResult.tokens.expiresAt,
            expiresInMinutes: Math.floor((refreshResult.tokens.expiresAt.getTime() - now.getTime()) / (1000 * 60)),
            needsRefresh: false,
            hasRefreshToken: !!refreshResult.tokens.refreshToken
          }
        });
      } else {
        // Refresh failed
        const response = NextResponse.json(
          {
            error: 'Refresh Failed',
            message: 'Failed to refresh authentication token'
          },
          { status: 401 }
        );

        response.cookies.delete('auth_session');
        return response;
      }
    }

    // Session is still valid, extend cookie expiration
    const response = NextResponse.json({
      success: true,
      refreshed: false,
      user: session.user,
      session: {
        expiresAt: session.tokenExpiry,
        expiresInMinutes,
        needsRefresh: expiresInMinutes < 5,
        hasRefreshToken: !!session.refreshToken
      }
    });

    // Extend session cookie
    response.cookies.set('auth_session', sessionUserId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 86400, // 24 hours
      path: '/'
    });

    return response;

  } catch (error) {
    console.error('Error extending session:', error);

    return NextResponse.json(
      {
        error: 'Session Error',
        message: 'Failed to extend session'
      },
      { status: 500 }
    );
  }
}