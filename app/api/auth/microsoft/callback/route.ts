import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth-service';

/**
 * GET /api/auth/microsoft/callback
 * Handle OAuth callback from Microsoft
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error, errorDescription);

      const errorUrl = new URL('/auth/error', request.url);
      errorUrl.searchParams.set('error', error);
      if (errorDescription) {
        errorUrl.searchParams.set('description', errorDescription);
      }

      return NextResponse.redirect(errorUrl);
    }

    // Validate required parameters
    if (!code || !state) {
      console.error('Missing required OAuth parameters');

      const errorUrl = new URL('/auth/error', request.url);
      errorUrl.searchParams.set('error', 'invalid_request');
      errorUrl.searchParams.set('description', 'Missing required parameters');

      return NextResponse.redirect(errorUrl);
    }

    // Get client information for security logging
    const ipAddress = request.ip ||
                     request.headers.get('x-forwarded-for')?.split(',')[0] ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Validate state parameter against stored cookie
    const storedState = request.cookies.get('oauth_state')?.value;
    if (!storedState || storedState !== state) {
      console.error('State parameter mismatch or missing');

      const errorUrl = new URL('/auth/error', request.url);
      errorUrl.searchParams.set('error', 'invalid_state');
      errorUrl.searchParams.set('description', 'Invalid or expired state parameter');

      return NextResponse.redirect(errorUrl);
    }

    // Exchange authorization code for tokens
    const authService = AuthService.getInstance();
    const result = await authService.exchangeCodeForTokens(code, state, ipAddress, userAgent);

    if (!result.success) {
      console.error('Failed to exchange code for tokens:', result.error);

      const errorUrl = new URL('/auth/error', request.url);
      errorUrl.searchParams.set('error', result.error?.code || 'token_exchange_failed');
      errorUrl.searchParams.set('description', result.error?.message || 'Failed to authenticate');

      return NextResponse.redirect(errorUrl);
    }

    // Successful authentication - redirect to dashboard or intended page
    const successUrl = new URL('/dashboard', request.url);

    const response = NextResponse.redirect(successUrl);

    // Set secure authentication session cookie
    if (result.user?.id) {
      response.cookies.set('auth_session', result.user.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400, // 24 hours
        path: '/'
      });
    }

    // Clear temporary OAuth cookies
    response.cookies.delete('oauth_state');
    response.cookies.delete('csrf_token');

    return response;

  } catch (error) {
    console.error('Error in OAuth callback:', error);

    const errorUrl = new URL('/auth/error', request.url);
    errorUrl.searchParams.set('error', 'server_error');
    errorUrl.searchParams.set('description', 'An unexpected error occurred during authentication');

    return NextResponse.redirect(errorUrl);
  }
}