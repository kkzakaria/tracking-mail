/**
 * API Routes pour la gestion des assignations de boîtes emails (Admin uniquement)
 * GET /api/admin/assignments - Lister toutes les assignations
 * POST /api/admin/assignments - Créer une nouvelle assignation
 */

import { NextRequest, NextResponse } from 'next/server';
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
 * GET /api/admin/assignments
 * Obtenir toutes les assignations avec filtres
 */
export async function GET(request: NextRequest) {
  const adminCheck = await verifyAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const mailboxId = searchParams.get('mailboxId');
    const isActive = searchParams.get('isActive');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from('user_mailbox_assignments')
      .select(`
        *,
        user_profiles!inner(
          id,
          email,
          full_name,
          display_name,
          role
        ),
        mailboxes!inner(
          id,
          email_address,
          display_name,
          description,
          mailbox_type,
          is_active,
          sync_status
        )
      `)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    // Appliquer les filtres
    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (mailboxId) {
      query = query.eq('mailbox_id', mailboxId);
    }
    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }

    const { data: assignments, error: assignmentError } = await query;

    if (assignmentError) {
      return NextResponse.json(
        { error: 'FETCH_ERROR', message: 'Erreur lors de la récupération des assignations' },
        { status: 500 }
      );
    }

    // Compter le total pour la pagination
    let countQuery = supabase
      .from('user_mailbox_assignments')
      .select('*', { count: 'exact', head: true });

    if (userId) countQuery = countQuery.eq('user_id', userId);
    if (mailboxId) countQuery = countQuery.eq('mailbox_id', mailboxId);
    if (isActive !== null) countQuery = countQuery.eq('is_active', isActive === 'true');

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.warn('Error counting assignments:', countError);
    }

    return NextResponse.json({
      success: true,
      data: {
        assignments: assignments || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error getting assignments:', error);
    return NextResponse.json(
      { error: 'GET_ASSIGNMENTS_ERROR', message: 'Erreur lors de la récupération des assignations' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/assignments
 * Créer une nouvelle assignation utilisateur-boîte
 */
export async function POST(request: NextRequest) {
  const adminCheck = await verifyAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  const adminUserId = adminCheck as string;

  try {
    const body = await request.json();
    const {
      userId,
      mailboxId,
      permissionLevel = 'read',
      expiresAt,
      notes
    } = body;

    if (!userId || !mailboxId) {
      return NextResponse.json(
        { error: 'MISSING_FIELDS', message: 'userId et mailboxId sont requis' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    // Vérifier que l'utilisateur existe et est actif
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, is_active')
      .eq('id', userId)
      .eq('is_active', true)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'Utilisateur non trouvé ou inactif' },
        { status: 404 }
      );
    }

    // Vérifier que la boîte email existe et est active
    const { data: mailbox, error: mailboxError } = await supabase
      .from('mailboxes')
      .select('id, email_address, display_name, is_active')
      .eq('id', mailboxId)
      .eq('is_active', true)
      .single();

    if (mailboxError || !mailbox) {
      return NextResponse.json(
        { error: 'MAILBOX_NOT_FOUND', message: 'Boîte email non trouvée ou inactive' },
        { status: 404 }
      );
    }

    // Vérifier si une assignation active existe déjà
    const { data: existingAssignment, error: checkError } = await supabase
      .from('user_mailbox_assignments')
      .select('id, is_active')
      .eq('user_id', userId)
      .eq('mailbox_id', mailboxId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      return NextResponse.json(
        { error: 'CHECK_ERROR', message: 'Erreur lors de la vérification des assignations existantes' },
        { status: 500 }
      );
    }

    // Si une assignation existe déjà
    if (existingAssignment) {
      if (existingAssignment.is_active) {
        return NextResponse.json(
          { error: 'ASSIGNMENT_EXISTS', message: 'Cet utilisateur est déjà assigné à cette boîte email' },
          { status: 409 }
        );
      } else {
        // Réactiver l'assignation existante
        const { data: reactivatedAssignment, error: reactivateError } = await supabase
          .from('user_mailbox_assignments')
          .update({
            is_active: true,
            permission_level: permissionLevel,
            assigned_by: adminUserId,
            assigned_at: new Date().toISOString(),
            expires_at: expiresAt || null,
            notes: notes || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingAssignment.id)
          .select(`
            *,
            user_profiles!inner(id, email, full_name, display_name),
            mailboxes!inner(id, email_address, display_name)
          `)
          .single();

        if (reactivateError) {
          return NextResponse.json(
            { error: 'REACTIVATE_ERROR', message: 'Erreur lors de la réactivation de l\'assignation' },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          data: reactivatedAssignment,
          message: 'Assignation réactivée avec succès'
        });
      }
    }

    // Créer une nouvelle assignation
    const { data: newAssignment, error: insertError } = await supabase
      .from('user_mailbox_assignments')
      .insert({
        user_id: userId,
        mailbox_id: mailboxId,
        permission_level: permissionLevel,
        assigned_by: adminUserId,
        assigned_at: new Date().toISOString(),
        expires_at: expiresAt || null,
        notes: notes || null,
        is_active: true
      })
      .select(`
        *,
        user_profiles!inner(id, email, full_name, display_name),
        mailboxes!inner(id, email_address, display_name)
      `)
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: 'INSERT_ERROR', message: 'Erreur lors de la création de l\'assignation' },
        { status: 500 }
      );
    }

    // Logger l'activité d'assignation
    await supabase
      .from('user_activity_logs')
      .insert({
        user_id: userId,
        activity_type: 'assignment_changed',
        activity_description: `Assigné à la boîte email ${mailbox.email_address}`,
        resource_id: mailboxId,
        resource_type: 'mailbox',
        metadata: {
          assigned_by: adminUserId,
          permission_level: permissionLevel
        }
      });

    return NextResponse.json({
      success: true,
      data: newAssignment,
      message: `${user.full_name || user.email} a été assigné(e) à ${mailbox.display_name || mailbox.email_address}`
    });

  } catch (error) {
    console.error('Error creating assignment:', error);
    return NextResponse.json(
      { error: 'CREATE_ASSIGNMENT_ERROR', message: 'Erreur lors de la création de l\'assignation' },
      { status: 500 }
    );
  }
}