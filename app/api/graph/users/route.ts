import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth-service';
import { AdminGraphService } from '@/lib/services/admin-graph-service';

/**
 * GET /api/graph/users
 * Get all users in the organization
 */
export async function GET(request: NextRequest) {
  try {
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

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const filter = searchParams.get('filter');

    // Get users from Microsoft Graph
    const graphService = AdminGraphService.getInstance();
    const users = await graphService.getAllUsers(session.accessToken, {
      retries: 3,
      timeout: 30000,
      rateLimitHandling: true
    });

    // Apply client-side filtering if search parameter is provided
    let filteredUsers = users;

    if (search) {
      const searchLower = search.toLowerCase();
      filteredUsers = users.filter(user =>
        (user.displayName?.toLowerCase().includes(searchLower)) ||
        (user.mail?.toLowerCase().includes(searchLower)) ||
        (user.userPrincipalName?.toLowerCase().includes(searchLower)) ||
        (user.department?.toLowerCase().includes(searchLower)) ||
        (user.jobTitle?.toLowerCase().includes(searchLower))
      );
    }

    if (filter) {
      // Apply additional filtering based on filter parameter
      const filterLower = filter.toLowerCase();
      if (filterLower === 'mail') {
        filteredUsers = filteredUsers.filter(user => user.mail);
      } else if (filterLower === 'department') {
        filteredUsers = filteredUsers.filter(user => user.department);
      }
    }

    // Apply limit
    const limitedUsers = filteredUsers.slice(0, limit);

    return NextResponse.json({
      success: true,
      users: limitedUsers,
      total: filteredUsers.length,
      limit,
      hasMore: filteredUsers.length > limit
    });

  } catch (error) {
    console.error('Error fetching users:', error);

    return NextResponse.json(
      {
        error: 'Graph API Error',
        message: error instanceof Error ? error.message : 'Failed to fetch users from Microsoft Graph'
      },
      { status: 500 }
    );
  }
}