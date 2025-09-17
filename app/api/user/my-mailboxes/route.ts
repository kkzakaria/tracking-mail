/**
 * API Routes pour les boîtes emails assignées à l'utilisateur connecté
 * GET /api/user/my-mailboxes - Obtenir les boîtes emails assignées à l'utilisateur
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminGraphService } from '@/lib/services/admin-graph-service';
import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';

/**
 * Vérifier que l'utilisateur est authentifié
 */
async function verifyAuth(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentification requise' }, { status: 401 });
  }

  // Vérifier que l'utilisateur a un profil actif
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .eq('is_active', true)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'PROFILE_NOT_FOUND', message: 'Profil utilisateur non trouvé ou inactif' }, { status: 403 });
  }

  return { userId: user.id, profile };
}

/**
 * GET /api/user/my-mailboxes
 * Obtenir les boîtes emails assignées à l'utilisateur connecté
 */
export async function GET(request: NextRequest) {
  const authCheck = await verifyAuth(request);
  if (authCheck instanceof NextResponse) return authCheck;

  const { userId, profile } = authCheck;

  try {
    const { searchParams } = new URL(request.url);
    const includeMessages = searchParams.get('includeMessages') === 'true';
    const messageLimit = parseInt(searchParams.get('messageLimit') || '10');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    const supabase = await createSupabaseServerClient();

    // Obtenir les assignations actives de l'utilisateur avec les détails des boîtes
    const { data: assignments, error: assignmentError } = await supabase
      .from('user_mailbox_assignments')
      .select(`
        id,
        permission_level,
        assigned_at,
        expires_at,
        notes,
        mailboxes!inner(
          id,
          email_address,
          display_name,
          description,
          mailbox_type,
          is_active,
          sync_enabled,
          last_sync_at,
          sync_status,
          sync_error
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('mailboxes.is_active', true)
      .order('assigned_at', { ascending: false });

    if (assignmentError) {
      return NextResponse.json(
        { error: 'FETCH_ERROR', message: 'Erreur lors de la récupération de vos boîtes emails' },
        { status: 500 }
      );
    }

    const mailboxes = assignments || [];

    // Si demandé, récupérer les messages pour chaque boîte
    if (includeMessages && mailboxes.length > 0) {
      const adminGraphService = AdminGraphService.getInstance();

      // Initialiser le service Graph si nécessaire
      const initResult = await adminGraphService.initialize();
      if (!initResult.success) {
        // Ne pas faire échouer la requête si Graph n'est pas configuré
        // Retourner juste les boîtes sans messages
        return NextResponse.json({
          success: true,
          data: {
            mailboxes: mailboxes,
            graphConfigured: false,
            message: 'Microsoft Graph n\'est pas configuré. Seules les informations des boîtes sont disponibles.'
          }
        });
      }

      // Récupérer les messages pour chaque boîte (en parallèle pour la performance)
      const mailboxPromises = mailboxes.map(async (assignment) => {
        try {
          const messagesResult = await adminGraphService.getMailboxMessages(
            assignment.mailboxes.email_address,
            {
              limit: messageLimit,
              unreadOnly: unreadOnly
            }
          );

          return {
            ...assignment,
            messages: messagesResult.success ? messagesResult.data : [],
            messagesError: messagesResult.success ? null : messagesResult.error?.message
          };
        } catch (error) {
          console.error(`Error getting messages for ${assignment.mailboxes.email_address}:`, error);
          return {
            ...assignment,
            messages: [],
            messagesError: 'Erreur lors de la récupération des messages'
          };
        }
      });

      const mailboxesWithMessages = await Promise.all(mailboxPromises);

      return NextResponse.json({
        success: true,
        data: {
          mailboxes: mailboxesWithMessages,
          graphConfigured: true,
          user: {
            id: profile.id,
            email: profile.email,
            displayName: profile.display_name || profile.full_name
          }
        }
      });
    }

    // Logger l'accès aux boîtes
    await supabase
      .from('user_activity_logs')
      .insert({
        user_id: userId,
        activity_type: 'mailbox_access',
        activity_description: `Consultation des ${mailboxes.length} boîtes assignées`,
        metadata: {
          mailbox_count: mailboxes.length,
          include_messages: includeMessages
        }
      });

    return NextResponse.json({
      success: true,
      data: {
        mailboxes: mailboxes,
        graphConfigured: true,
        user: {
          id: profile.id,
          email: profile.email,
          displayName: profile.display_name || profile.full_name
        }
      }
    });

  } catch (error) {
    console.error('Error getting user mailboxes:', error);
    return NextResponse.json(
      { error: 'GET_USER_MAILBOXES_ERROR', message: 'Erreur lors de la récupération de vos boîtes emails' },
      { status: 500 }
    );
  }
}