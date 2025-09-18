/**
 * API temporaire pour assigner service-exploitation@karta-transit.ci
 * POST /api/admin/assign-service - Assigner la boîte service à l'utilisateur actuel
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    // Vérifier l'authentification
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentification requise' }, { status: 401 });
    }

    // Récupérer la boîte service-exploitation
    const { data: mailbox, error: mailboxError } = await supabase
      .from('mailboxes')
      .select('id, email_address, display_name')
      .eq('email_address', 'service-exploitation@karta-transit.ci')
      .eq('is_active', true)
      .single();

    if (mailboxError || !mailbox) {
      return NextResponse.json({ error: 'NO_MAILBOX', message: 'Boîte service-exploitation@karta-transit.ci non trouvée' }, { status: 404 });
    }

    // Vérifier si l'assignation existe déjà
    const { data: existingAssignment } = await supabase
      .from('user_mailbox_assignments')
      .select('id')
      .eq('user_id', user.id)
      .eq('mailbox_id', mailbox.id)
      .single();

    if (existingAssignment) {
      return NextResponse.json({
        success: true,
        message: 'Assignation existe déjà',
        data: { mailbox, assignment: existingAssignment }
      });
    }

    // Créer l'assignation avec permission read_write
    const { data: assignment, error: assignmentError } = await supabase
      .from('user_mailbox_assignments')
      .insert({
        user_id: user.id,
        mailbox_id: mailbox.id,
        permission_level: 'read_write',
        assigned_by: user.id,
        assigned_at: new Date().toISOString()
      })
      .select()
      .single();

    if (assignmentError) {
      console.error('Erreur création assignation service:', assignmentError);
      return NextResponse.json({ error: 'ASSIGNMENT_ERROR', message: 'Erreur lors de la création de l\'assignation' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Boîte ${mailbox.email_address} assignée avec succès`,
      data: { mailbox, assignment }
    });

  } catch (error) {
    console.error('Erreur assign-service:', error);
    return NextResponse.json({ error: 'SERVER_ERROR', message: 'Erreur serveur' }, { status: 500 });
  }
}