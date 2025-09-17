import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/services/auth-service';
import { MicrosoftGraphService } from '@/lib/services/microsoft-graph';

/**
 * GET /api/graph/mail/[userId]
 * Get mail messages for a specific user
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
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    // Get mail from Microsoft Graph
    const graphService = MicrosoftGraphService.getInstance();
    const messages = await graphService.getUserMail(userId, session.accessToken, {
      retries: 3,
      timeout: 30000,
      rateLimitHandling: true
    });

    // Filter for unread messages if requested
    let filteredMessages = messages;
    if (unreadOnly) {
      filteredMessages = messages.filter((message: Record<string, unknown>) => !message.isRead);
    }

    // Apply limit
    const limitedMessages = filteredMessages.slice(0, limit);

    return NextResponse.json({
      success: true,
      messages: limitedMessages,
      total: filteredMessages.length,
      limit,
      hasMore: filteredMessages.length > limit,
      unreadOnly
    });

  } catch (error) {
    console.error('Error fetching mail:', error);

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
            message: 'Insufficient permissions to access mail for this user'
          },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Graph API Error',
        message: error instanceof Error ? error.message : 'Failed to fetch mail from Microsoft Graph'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/graph/mail/[userId]
 * Send mail on behalf of a user
 */
export async function POST(
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

    // Parse request body
    const body = await request.json();
    const { subject, body: messageBody, toRecipients, ccRecipients, importance = 'normal' } = body;

    // Validate required fields
    if (!subject || !messageBody || !toRecipients || !Array.isArray(toRecipients) || toRecipients.length === 0) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Missing required fields: subject, body, and toRecipients are required'
        },
        { status: 400 }
      );
    }

    // Format message for Microsoft Graph
    const message = {
      subject,
      body: {
        contentType: 'HTML',
        content: messageBody
      },
      toRecipients: toRecipients.map((email: string) => ({
        emailAddress: {
          address: email
        }
      })),
      importance
    };

    // Add CC recipients if provided
    if (ccRecipients && Array.isArray(ccRecipients) && ccRecipients.length > 0) {
      (message as { ccRecipients?: Array<{ emailAddress: { address: string } }> }).ccRecipients = ccRecipients.map((email: string) => ({
        emailAddress: {
          address: email
        }
      }));
    }

    // Send mail through Microsoft Graph
    const graphService = MicrosoftGraphService.getInstance();
    const result = await graphService.sendMail(userId, message, session.accessToken, {
      retries: 3,
      timeout: 30000,
      rateLimitHandling: true
    });

    return NextResponse.json({
      success: true,
      message: 'Email sent successfully',
      id: (result as { id?: string })?.id || 'unknown'
    });

  } catch (error) {
    console.error('Error sending mail:', error);

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
            message: 'Insufficient permissions to send mail for this user'
          },
          { status: 403 }
        );
      }

      if (error.message.includes('400') || error.message.includes('BadRequest')) {
        return NextResponse.json(
          {
            error: 'Bad Request',
            message: 'Invalid email data provided'
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Graph API Error',
        message: error instanceof Error ? error.message : 'Failed to send mail through Microsoft Graph'
      },
      { status: 500 }
    );
  }
}