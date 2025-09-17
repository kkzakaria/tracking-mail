import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth-service';
import { validateMicrosoftGraphConfig } from '@/lib/config/microsoft-graph';
import { generateStateParameter, generateCSRFToken } from '@/lib/utils/encryption';

/**
 * GET /api/auth/microsoft
 * Initiate OAuth flow with Microsoft
 */
export async function GET(request: NextRequest) {
  try {
    // Validate configuration
    const configValidation = validateMicrosoftGraphConfig();
    if (!configValidation.isValid) {
      console.error('Microsoft Graph configuration invalid:', configValidation.errors);
      return NextResponse.json(
        {
          error: 'Configuration Error',
          message: 'Microsoft Graph authentication is not properly configured'
        },
        { status: 500 }
      );
    }

    // Get client IP and user agent for security logging
    const ipAddress = request.ip ||
                     request.headers.get('x-forwarded-for')?.split(',')[0] ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Check rate limiting
    const authService = AuthService.getInstance();
    const isAllowed = await authService.checkRateLimit(ipAddress);

    if (!isAllowed) {
      return NextResponse.json(
        {
          error: 'Rate Limited',
          message: 'Too many authentication attempts. Please try again later.'
        },
        { status: 429 }
      );
    }

    // Generate security parameters
    const state = generateStateParameter();
    const csrfToken = generateCSRFToken();

    // Generate authorization URL
    const authUrl = authService.generateAuthUrl(state);

    // Store state and CSRF token in secure httpOnly cookies
    const response = NextResponse.json({
      authUrl,
      state
    });

    // Set secure cookies
    response.cookies.set('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/'
    });

    response.cookies.set('csrf_token', csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/'
    });

    return response;

  } catch (error) {
    console.error('Error initiating Microsoft OAuth:', error);

    return NextResponse.json(
      {
        error: 'Authentication Error',
        message: 'Failed to initiate authentication with Microsoft'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/microsoft
 * Handle direct authentication (for development/testing)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, state } = body;

    if (!code || !state) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Missing required parameters: code and state'
        },
        { status: 400 }
      );
    }

    // Get client information
    const ipAddress = request.ip ||
                     request.headers.get('x-forwarded-for')?.split(',')[0] ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Validate state parameter against cookie
    const storedState = request.cookies.get('oauth_state')?.value;
    if (!storedState || storedState !== state) {
      return NextResponse.json(
        {
          error: 'Invalid State',
          message: 'Invalid or expired state parameter'
        },
        { status: 400 }
      );
    }

    // Exchange code for tokens
    const authService = AuthService.getInstance();
    const result = await authService.exchangeCodeForTokens(code, state, ipAddress, userAgent);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error?.code || 'Authentication Failed',
          message: result.error?.message || 'Failed to authenticate with Microsoft'
        },
        { status: 400 }
      );
    }

    // Create response with user data
    const response = NextResponse.json({
      success: true,
      user: result.user,
      expiresAt: result.tokens?.expiresAt
    });

    // Set authentication session cookie
    if (result.user?.id) {
      response.cookies.set('auth_session', result.user.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400, // 24 hours
        path: '/'
      });
    }

    // Clear temporary cookies
    response.cookies.delete('oauth_state');
    response.cookies.delete('csrf_token');

    return response;

  } catch (error) {
    console.error('Error handling Microsoft OAuth callback:', error);

    return NextResponse.json(
      {
        error: 'Authentication Error',
        message: 'Failed to process authentication callback'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/microsoft
 * Logout and revoke tokens
 */
export async function DELETE(request: NextRequest) {
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
    const ipAddress = request.ip ||
                     request.headers.get('x-forwarded-for')?.split(',')[0] ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Logout user
    const authService = AuthService.getInstance();
    await authService.logout(sessionUserId, ipAddress, userAgent);

    // Create response
    const response = NextResponse.json({
      success: true,
      message: 'Successfully logged out'
    });

    // Clear session cookie
    response.cookies.delete('auth_session');

    // Provide logout URL for complete Microsoft logout
    const logoutUrl = authService.getLogoutUrl(process.env.NEXT_PUBLIC_APP_URL);

    return NextResponse.json({
      success: true,
      message: 'Successfully logged out',
      logoutUrl
    });

  } catch (error) {
    console.error('Error during logout:', error);

    return NextResponse.json(
      {
        error: 'Logout Error',
        message: 'Failed to logout properly'
      },
      { status: 500 }
    );
  }
}