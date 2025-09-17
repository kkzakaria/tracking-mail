/**
 * API Routes pour la gestion des boîtes emails (Admin uniquement)
 * GET /api/admin/mailboxes - Lister toutes les boîtes emails
 * POST /api/admin/mailboxes - Ajouter une nouvelle boîte email
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
 * GET /api/admin/mailboxes
 * Obtenir toutes les boîtes emails avec leurs assignations
 */
export async function GET(request: NextRequest) {
  const adminCheck = await verifyAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    const supabase = await createSupabaseServerClient();

    // Obtenir les boîtes emails avec les assignations
    const { data: mailboxes, error: mailboxError } = await supabase
      .from('mailboxes')
      .select(`
        *,
        user_mailbox_assignments!inner(
          id,
          permission_level,
          is_active,
          assigned_at,
          expires_at,
          user_profiles!inner(
            id,
            email,
            full_name,
            display_name
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (mailboxError) {
      return NextResponse.json(
        { error: 'FETCH_ERROR', message: 'Erreur lors de la récupération des boîtes emails' },
        { status: 500 }
      );
    }

    // Obtenir les statistiques Microsoft Graph
    const adminGraphService = AdminGraphService.getInstance();
    const graphStats = await adminGraphService.getOrganizationStats();

    return NextResponse.json({
      success: true,
      data: {
        mailboxes: mailboxes || [],
        stats: graphStats.success ? graphStats.data : null
      }
    });

  } catch (error) {
    console.error('Error getting mailboxes:', error);
    return NextResponse.json(
      { error: 'GET_MAILBOXES_ERROR', message: 'Erreur lors de la récupération des boîtes emails' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/mailboxes
 * Ajouter une nouvelle boîte email depuis Microsoft Graph
 */
export async function POST(request: NextRequest) {
  const adminCheck = await verifyAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    const body = await request.json();
    const { emailAddress, displayName, description, mailboxType = 'user' } = body;

    if (!emailAddress) {
      return NextResponse.json(
        { error: 'MISSING_EMAIL', message: 'L\'adresse email est requise' },
        { status: 400 }
      );
    }

    // Vérifier si l'utilisateur existe dans Microsoft Graph
    const adminGraphService = AdminGraphService.getInstance();
    const usersResult = await adminGraphService.getAllUsers();

    if (!usersResult.success) {
      return NextResponse.json(
        {
          error: 'GRAPH_ERROR',
          message: 'Impossible de vérifier l\'utilisateur dans Microsoft Graph'
        },
        { status: 500 }
      );
    }

    const userExists = usersResult.data?.some(user =>
      user.mail?.toLowerCase() === emailAddress.toLowerCase() ||
      user.userPrincipalName?.toLowerCase() === emailAddress.toLowerCase()
    );

    if (!userExists) {
      return NextResponse.json(
        {
          error: 'USER_NOT_FOUND',
          message: 'Cet utilisateur n\'existe pas dans Microsoft Graph'
        },
        { status: 400 }
      );
    }

    // Ajouter la boîte email dans Supabase
    const supabase = await createSupabaseServerClient();

    const { data: mailbox, error: insertError } = await supabase
      .from('mailboxes')
      .insert({
        email_address: emailAddress.toLowerCase(),
        display_name: displayName || emailAddress,
        description: description || null,
        mailbox_type: mailboxType,
        is_active: true,
        sync_enabled: true,
        sync_status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') { // Contrainte d'unicité
        return NextResponse.json(
          { error: 'MAILBOX_EXISTS', message: 'Cette boîte email est déjà ajoutée' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'INSERT_ERROR', message: 'Erreur lors de l\'ajout de la boîte email' },
        { status: 500 }
      );
    }

    // Tenter une synchronisation initiale
    const syncResult = await adminGraphService.syncMailbox(emailAddress);

    return NextResponse.json({
      success: true,
      data: mailbox,
      syncResult: syncResult.success ? syncResult.data : null,
      message: 'Boîte email ajoutée avec succès'
    });

  } catch (error) {
    console.error('Error adding mailbox:', error);
    return NextResponse.json(
      { error: 'ADD_MAILBOX_ERROR', message: 'Erreur lors de l\'ajout de la boîte email' },
      { status: 500 }
    );
  }
}