/**
 * API Route pour les messages d'une boîte email assignée à l'utilisateur
 * GET /api/user/mailbox/[id]/messages - Obtenir les messages d'une boîte assignée
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminGraphService } from '@/lib/services/admin-graph-service';
import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';

/**
 * Vérifier l'authentification et l'accès à la boîte email
 */
async function verifyAccessToMailbox(request: NextRequest, mailboxId: string) {
  const supabase = await createSupabaseServerClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentification requise' }, { status: 401 });
  }

  // Vérifier que l'utilisateur a accès à cette boîte email
  const { data: assignment, error: assignmentError } = await supabase
    .from('user_mailbox_assignments')
    .select(`
      id,
      permission_level,
      mailboxes!inner(
        id,
        email_address,
        display_name,
        is_active,
        sync_enabled,
        sync_status
      )
    `)
    .eq('user_id', user.id)
    .eq('mailbox_id', mailboxId)
    .eq('is_active', true)
    .eq('mailboxes.is_active', true)
    .single();

  if (assignmentError || !assignment) {
    return NextResponse.json(
      { error: 'ACCESS_DENIED', message: 'Accès non autorisé à cette boîte email' },
      { status: 403 }
    );
  }

  return { userId: user.id, assignment };
}

/**
 * GET /api/user/mailbox/[id]/messages
 * Obtenir les messages d'une boîte email assignée
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const accessCheck = await verifyAccessToMailbox(request, params.id);
  if (accessCheck instanceof NextResponse) return accessCheck;

  const { userId, assignment } = accessCheck;

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const page = parseInt(searchParams.get('page') || '1');

    // Valider les paramètres
    if (limit > 100) {
      return NextResponse.json(
        { error: 'LIMIT_TOO_HIGH', message: 'Le limit maximum est de 100 messages' },
        { status: 400 }
      );
    }

    // Initialiser et vérifier Microsoft Graph
    const adminGraphService = AdminGraphService.getInstance();
    const initResult = await adminGraphService.initialize();

    if (!initResult.success) {
      return NextResponse.json(
        {
          error: 'GRAPH_NOT_CONFIGURED',
          message: 'Microsoft Graph n\'est pas configuré. Contactez votre administrateur.'
        },
        { status: 503 }
      );
    }

    // Récupérer les messages
    const messagesResult = await adminGraphService.getMailboxMessages(
      assignment.mailboxes.email_address,
      {
        limit: limit,
        unreadOnly: unreadOnly
      }
    );

    if (!messagesResult.success) {
      return NextResponse.json(
        {
          error: messagesResult.error?.code || 'FETCH_MESSAGES_ERROR',
          message: messagesResult.error?.message || 'Erreur lors de la récupération des messages'
        },
        { status: 500 }
      );
    }

    const messages = messagesResult.data || [];

    // Pagination simple côté client (Microsoft Graph gère sa propre pagination)
    const totalMessages = messages.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedMessages = messages.slice(startIndex, endIndex);

    // Logger l'accès aux emails
    const supabase = await createSupabaseServerClient();
    await supabase
      .from('user_activity_logs')
      .insert({
        user_id: userId,
        activity_type: 'email_read',
        activity_description: `Consultation des emails de ${assignment.mailboxes.display_name || assignment.mailboxes.email_address}`,
        resource_id: params.id,
        resource_type: 'mailbox',
        metadata: {
          message_count: paginatedMessages.length,
          unread_only: unreadOnly,
          permission_level: assignment.permission_level
        }
      });

    return NextResponse.json({
      success: true,
      data: {
        messages: paginatedMessages,
        mailbox: {
          id: assignment.mailboxes.id,
          emailAddress: assignment.mailboxes.email_address,
          displayName: assignment.mailboxes.display_name,
          syncStatus: assignment.mailboxes.sync_status,
          syncEnabled: assignment.mailboxes.sync_enabled
        },
        pagination: {
          page: page,
          limit: limit,
          total: totalMessages,
          hasMore: endIndex < totalMessages
        },
        permission: assignment.permission_level
      }
    });

  } catch (error) {
    console.error('Error getting mailbox messages:', error);
    return NextResponse.json(
      { error: 'GET_MESSAGES_ERROR', message: 'Erreur lors de la récupération des messages' },
      { status: 500 }
    );
  }
}