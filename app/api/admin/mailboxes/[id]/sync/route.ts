/**
 * API Route pour synchroniser une boîte email spécifique
 * POST /api/admin/mailboxes/[id]/sync - Synchroniser une boîte email
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
 * POST /api/admin/mailboxes/[id]/sync
 * Synchroniser une boîte email avec Microsoft Graph
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await verifyAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    const supabase = await createSupabaseServerClient();

    // Obtenir les détails de la boîte email
    const { data: mailbox, error: mailboxError } = await supabase
      .from('mailboxes')
      .select('*')
      .eq('id', params.id)
      .eq('is_active', true)
      .single();

    if (mailboxError || !mailbox) {
      return NextResponse.json(
        { error: 'MAILBOX_NOT_FOUND', message: 'Boîte email non trouvée ou inactive' },
        { status: 404 }
      );
    }

    if (!mailbox.sync_enabled) {
      return NextResponse.json(
        { error: 'SYNC_DISABLED', message: 'La synchronisation est désactivée pour cette boîte' },
        { status: 400 }
      );
    }

    // Marquer comme en cours de synchronisation
    await supabase
      .from('mailboxes')
      .update({
        sync_status: 'syncing',
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id);

    // Lancer la synchronisation
    const adminGraphService = AdminGraphService.getInstance();
    const syncResult = await adminGraphService.syncMailbox(mailbox.email_address);

    if (!syncResult.success) {
      // Le statut d'erreur est déjà mis à jour dans syncMailbox
      return NextResponse.json(
        {
          error: syncResult.error?.code || 'SYNC_ERROR',
          message: syncResult.error?.message || 'Erreur lors de la synchronisation'
        },
        { status: 500 }
      );
    }

    // Obtenir les messages récents après synchronisation
    const messagesResult = await adminGraphService.getMailboxMessages(
      mailbox.email_address,
      { limit: 10 }
    );

    return NextResponse.json({
      success: true,
      data: {
        messageCount: syncResult.data?.messageCount || 0,
        recentMessages: messagesResult.success ? messagesResult.data : [],
        syncedAt: new Date().toISOString()
      },
      message: `Synchronisation réussie : ${syncResult.data?.messageCount || 0} messages trouvés`
    });

  } catch (error) {
    console.error('Error syncing mailbox:', error);

    // Marquer comme erreur en cas d'exception
    try {
      const supabase = await createSupabaseServerClient();
      await supabase
        .from('mailboxes')
        .update({
          sync_status: 'error',
          sync_error: error instanceof Error ? error.message : 'Erreur inconnue',
          updated_at: new Date().toISOString()
        })
        .eq('id', params.id);
    } catch (updateError) {
      console.error('Error updating sync status:', updateError);
    }

    return NextResponse.json(
      { error: 'SYNC_ERROR', message: 'Erreur lors de la synchronisation de la boîte email' },
      { status: 500 }
    );
  }
}