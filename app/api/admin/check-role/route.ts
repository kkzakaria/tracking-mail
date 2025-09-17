/**
 * API Route pour vérifier le rôle administrateur
 * GET /api/admin/check-role - Vérifier si l'utilisateur connecté a le rôle admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';

/**
 * GET /api/admin/check-role
 * Vérifier si l'utilisateur connecté a le rôle admin
 */
export async function GET(request: NextRequest) {
  console.log('🔒 API check-role: GET request received');

  try {
    const supabase = await createSupabaseServerClient();

    // Vérifier que l'utilisateur est authentifié
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log('🔒 API check-role: getUser result', {
      user: !!user,
      userId: user?.id,
      email: user?.email,
      error: userError?.message
    });

    if (userError || !user) {
      console.log('🔒 API check-role: Auth failed', userError);
      return NextResponse.json({
        success: false,
        isAdmin: false,
        error: 'UNAUTHORIZED',
        message: 'Authentification requise'
      }, { status: 401 });
    }

    // Récupérer le profil utilisateur pour vérifier le rôle
    console.log('🔒 API check-role: Checking user profile for', user.id);
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email, role, is_active')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    console.log('🔒 API check-role: Profile check result', {
      profile: !!profile,
      profileId: profile?.id,
      role: profile?.role,
      isActive: profile?.is_active,
      error: profileError?.message
    });

    if (profileError || !profile) {
      console.log('🔒 API check-role: Profile not found or inactive');
      return NextResponse.json({
        success: false,
        isAdmin: false,
        error: 'PROFILE_NOT_FOUND',
        message: 'Profil utilisateur non trouvé ou inactif'
      }, { status: 403 });
    }

    // Vérifier si l'utilisateur a le rôle admin
    const isAdmin = profile.role === 'admin';
    console.log('🔒 API check-role: Role verification', {
      userId: user.id,
      role: profile.role,
      isAdmin
    });

    return NextResponse.json({
      success: true,
      isAdmin,
      user: {
        id: profile.id,
        email: profile.email,
        role: profile.role
      }
    });

  } catch (error) {
    console.error('Error checking admin role:', error);
    return NextResponse.json(
      {
        success: false,
        isAdmin: false,
        error: 'CHECK_ROLE_ERROR',
        message: 'Erreur lors de la vérification du rôle'
      },
      { status: 500 }
    );
  }
}