import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth-service';
import { GraphUserService } from '@/lib/services/graph';

/**
 * GET /api/graph/users/[userId]
 * Get specific user information
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    // Verify authentication
    const sessionUserId = request.cookies.get('auth_session')?.value;

    if (!sessionUserId) {
      return NextResponse.json(
        {
          error: 'Not Authenticated',
          message: 'Authentication required to access Microsoft Graph'
        },
        { status: 401 }
      );
    }

    // Validate session and get access token
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

    // Validate userId parameter
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Valid userId parameter is required'
        },
        { status: 400 }
      );
    }

    // Get user from Microsoft Graph
    const userService = GraphUserService.getInstance();
    const result = await userService.getUserById(userId);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'User Not Found',
          message: result.error?.message || 'Failed to fetch user'
        },
        { status: 404 }
      );
    }

    const user = result.data;

    return NextResponse.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Error fetching user:', error);

    // Handle specific Graph API errors
    if (error instanceof Error) {
      if (error.message.includes('404') || error.message.includes('NotFound')) {
        return NextResponse.json(
          {
            error: 'User Not Found',
            message: 'The requested user was not found'
          },
          { status: 404 }
        );
      }

      if (error.message.includes('403') || error.message.includes('Forbidden')) {
        return NextResponse.json(
          {
            error: 'Access Denied',
            message: 'Insufficient permissions to access this user'
          },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Graph API Error',
        message: error instanceof Error ? error.message : 'Failed to fetch user from Microsoft Graph'
      },
      { status: 500 }
    );
  }
}