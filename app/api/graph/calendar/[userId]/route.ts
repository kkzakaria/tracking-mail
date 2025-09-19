import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth-service';
import { AdminGraphService } from '@/lib/services/admin-graph-service';

/**
 * GET /api/graph/calendar/[userId]
 * Get calendar events for a specific user
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

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // TODO: Calendar functionality needs to be implemented in new service architecture
    // This API route needs refactoring to use the appropriate specialized services
    return NextResponse.json(
      {
        error: 'Service Migration In Progress',
        message: 'Calendar API is being migrated to the new service architecture. This functionality is temporarily unavailable.'
      },
      { status: 501 }
    );

    // Filter by date range if provided
    let filteredEvents = events;
    if (startDate || endDate) {
      filteredEvents = events.filter((event: Record<string, unknown>) => {
        const startObj = event.start as { dateTime?: string } | undefined;
        const endObj = event.end as { dateTime?: string } | undefined;

        if (!startObj?.dateTime || !endObj?.dateTime) return false;

        const eventStart = new Date(startObj.dateTime);
        const eventEnd = new Date(endObj.dateTime);

        if (startDate && eventEnd < new Date(startDate)) {
          return false;
        }
        if (endDate && eventStart > new Date(endDate)) {
          return false;
        }
        return true;
      });
    }

    // Apply limit
    const limitedEvents = filteredEvents.slice(0, limit);

    return NextResponse.json({
      success: true,
      events: limitedEvents,
      total: filteredEvents.length,
      limit,
      hasMore: filteredEvents.length > limit,
      dateRange: {
        startDate,
        endDate
      }
    });

  } catch (error) {
    console.error('Error fetching calendar:', error);

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
            message: 'Insufficient permissions to access calendar for this user'
          },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Graph API Error',
        message: error instanceof Error ? error.message : 'Failed to fetch calendar from Microsoft Graph'
      },
      { status: 500 }
    );
  }
}