/**
 * API Routes pour une boîte email spécifique (Admin uniquement)
 * GET /api/admin/mailboxes/[id] - Obtenir les détails d'une boîte
 * PUT /api/admin/mailboxes/[id] - Mettre à jour une boîte
 * DELETE /api/admin/mailboxes/[id] - Supprimer une boîte
 * POST /api/admin/mailboxes/[id]/sync - Synchroniser une boîte
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminGraphService } from '@/lib/services/admin-graph-service';
import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';

/**
 * Vérifier les permissions admin
 */
async function verifyAdmin(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentification requise' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .eq('role', 'admin')
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'Accès réservé aux administrateurs' }, { status: 403 });
  }

  return user.id;
}

/**
 * GET /api/admin/mailboxes/[id]
 * Obtenir les détails d'une boîte email avec ses emails récents
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await verifyAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    const { searchParams } = new URL(request.url);
    const includeMessages = searchParams.get('includeMessages') === 'true';
    const messageLimit = parseInt(searchParams.get('limit') || '20');

    const supabase = await createSupabaseServerClient();

    // Obtenir les détails de la boîte
    const { data: mailbox, error: mailboxError } = await supabase
      .from('mailboxes')
      .select(`
        *,
        user_mailbox_assignments(
          id,
          permission_level,
          is_active,
          assigned_at,
          expires_at,
          user_profiles(
            id,
            email,
            full_name,
            display_name
          )
        )
      `)
      .eq('id', params.id)
      .single();

    if (mailboxError || !mailbox) {
      return NextResponse.json(
        { error: 'MAILBOX_NOT_FOUND', message: 'Boîte email non trouvée' },
        { status: 404 }
      );
    }

    let messages = null;
    if (includeMessages) {
      const adminGraphService = AdminGraphService.getInstance();
      const messagesResult = await adminGraphService.getMailboxMessages(
        mailbox.email_address,
        { limit: messageLimit }
      );

      if (messagesResult.success) {
        messages = messagesResult.data;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        mailbox,
        messages: messages
      }
    });

  } catch (error) {
    console.error('Error getting mailbox details:', error);
    return NextResponse.json(
      { error: 'GET_MAILBOX_ERROR', message: 'Erreur lors de la récupération de la boîte email' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/mailboxes/[id]
 * Mettre à jour une boîte email
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await verifyAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    const body = await request.json();
    const { displayName, description, isActive, syncEnabled } = body;

    const supabase = await createSupabaseServerClient();

    const updateData: any = {};
    if (displayName !== undefined) updateData.display_name = displayName;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.is_active = isActive;
    if (syncEnabled !== undefined) updateData.sync_enabled = syncEnabled;

    updateData.updated_at = new Date().toISOString();

    const { data: updatedMailbox, error: updateError } = await supabase
      .from('mailboxes')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'UPDATE_ERROR', message: 'Erreur lors de la mise à jour de la boîte email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedMailbox,
      message: 'Boîte email mise à jour avec succès'
    });

  } catch (error) {
    console.error('Error updating mailbox:', error);
    return NextResponse.json(
      { error: 'UPDATE_MAILBOX_ERROR', message: 'Erreur lors de la mise à jour de la boîte email' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/mailboxes/[id]
 * Supprimer une boîte email et ses assignations
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await verifyAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    const supabase = await createSupabaseServerClient();

    // Supprimer d'abord les assignations (CASCADE devrait le faire automatiquement)
    const { error: assignmentError } = await supabase
      .from('user_mailbox_assignments')
      .delete()
      .eq('mailbox_id', params.id);

    if (assignmentError) {
      console.warn('Warning deleting assignments:', assignmentError);
      // Continuer même si la suppression des assignations échoue
    }

    // Supprimer la boîte email
    const { error: deleteError } = await supabase
      .from('mailboxes')
      .delete()
      .eq('id', params.id);

    if (deleteError) {
      return NextResponse.json(
        { error: 'DELETE_ERROR', message: 'Erreur lors de la suppression de la boîte email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Boîte email supprimée avec succès'
    });

  } catch (error) {
    console.error('Error deleting mailbox:', error);
    return NextResponse.json(
      { error: 'DELETE_MAILBOX_ERROR', message: 'Erreur lors de la suppression de la boîte email' },
      { status: 500 }
    );
  }
}