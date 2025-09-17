/**
 * API Routes pour la configuration Microsoft Graph (Admin uniquement)
 * GET /api/admin/graph-config - Obtenir la configuration actuelle
 * POST /api/admin/graph-config - Configurer Microsoft Graph
 * PUT /api/admin/graph-config - Mettre à jour la configuration
 * DELETE /api/admin/graph-config - Désactiver la configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminGraphService } from '@/lib/services/admin-graph-service';
import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';

/**
 * Middleware de vérification admin
 */
async function verifyAdmin(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    // Obtenir l'utilisateur authentifié
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          message: 'Authentification requise'
        },
        { status: 401 }
      );
    }

    // Vérifier le rôle admin
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .eq('role', 'admin')
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'Accès réservé aux administrateurs'
        },
        { status: 403 }
      );
    }

    return user.id;

  } catch (error) {
    console.error('Error in admin verification:', error);
    return NextResponse.json(
      {
        error: 'VERIFICATION_ERROR',
        message: 'Erreur lors de la vérification des permissions'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/graph-config
 * Obtenir la configuration Microsoft Graph actuelle
 */
export async function GET(request: NextRequest) {
  // Vérifier les permissions admin
  const adminCheck = await verifyAdmin(request);
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  try {
    const adminGraphService = AdminGraphService.getInstance();

    // Obtenir le statut du service
    const statusResult = await adminGraphService.getServiceStatus();

    if (!statusResult.success) {
      return NextResponse.json(
        {
          error: statusResult.error?.code || 'STATUS_ERROR',
          message: statusResult.error?.message || 'Erreur lors de la vérification du statut'
        },
        { status: 500 }
      );
    }

    // Obtenir les statistiques si configuré
    let stats = null;
    if (statusResult.data.isConfigured && statusResult.data.configurationStatus === 'configured') {
      const statsResult = await adminGraphService.getOrganizationStats();
      if (statsResult.success) {
        stats = statsResult.data;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        status: statusResult.data,
        stats: stats
      }
    });

  } catch (error) {
    console.error('Error getting Graph configuration:', error);
    return NextResponse.json(
      {
        error: 'GET_CONFIG_ERROR',
        message: 'Erreur lors de la récupération de la configuration'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/graph-config
 * Configurer Microsoft Graph
 */
export async function POST(request: NextRequest) {
  // Vérifier les permissions admin
  const adminCheck = await verifyAdmin(request);
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  const adminUserId = adminCheck as string;

  try {
    const body = await request.json();
    const { tenantId, clientId, clientSecret, permissions } = body;

    // Valider les données requises
    if (!tenantId || !clientId || !clientSecret) {
      return NextResponse.json(
        {
          error: 'MISSING_FIELDS',
          message: 'Les champs tenantId, clientId et clientSecret sont requis'
        },
        { status: 400 }
      );
    }

    // Configurer Microsoft Graph
    const adminGraphService = AdminGraphService.getInstance();
    const configResult = await adminGraphService.configureGraph(
      {
        tenantId,
        clientId,
        clientSecret,
        permissions: permissions || [
          'https://graph.microsoft.com/Mail.Read',
          'https://graph.microsoft.com/Mail.ReadWrite',
          'https://graph.microsoft.com/User.Read.All',
          'https://graph.microsoft.com/Calendars.Read',
          'https://graph.microsoft.com/Directory.Read.All'
        ]
      },
      adminUserId
    );

    if (!configResult.success) {
      return NextResponse.json(
        {
          error: configResult.error?.code || 'CONFIG_ERROR',
          message: configResult.error?.message || 'Erreur lors de la configuration'
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: configResult.data?.id,
        configuration_status: configResult.data?.configuration_status,
        configured_at: configResult.data?.configured_at
      },
      message: 'Microsoft Graph configuré avec succès'
    });

  } catch (error) {
    console.error('Error configuring Microsoft Graph:', error);
    return NextResponse.json(
      {
        error: 'CONFIG_ERROR',
        message: 'Erreur lors de la configuration de Microsoft Graph'
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/graph-config
 * Mettre à jour la configuration Microsoft Graph
 */
export async function PUT(request: NextRequest) {
  // Vérifier les permissions admin
  const adminCheck = await verifyAdmin(request);
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  const adminUserId = adminCheck as string;

  try {
    const body = await request.json();
    const { isActive, permissions } = body;

    const supabase = await createSupabaseServerClient();

    // Mettre à jour la configuration
    const { data: updatedConfig, error: updateError } = await supabase
      .from('microsoft_graph_config')
      .update({
        is_active: isActive !== undefined ? isActive : undefined,
        permissions_granted: permissions ? JSON.stringify(permissions) : undefined,
        updated_at: new Date().toISOString()
      })
      .eq('is_active', true) // Mettre à jour la config active actuelle
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        {
          error: 'UPDATE_ERROR',
          message: 'Erreur lors de la mise à jour de la configuration'
        },
        { status: 500 }
      );
    }

    // Réinitialiser le service si nécessaire
    if (isActive === false) {
      // Le service sera automatiquement désactivé au prochain appel
    } else if (isActive === true) {
      const adminGraphService = AdminGraphService.getInstance();
      await adminGraphService.initialize();
    }

    return NextResponse.json({
      success: true,
      data: updatedConfig,
      message: 'Configuration mise à jour avec succès'
    });

  } catch (error) {
    console.error('Error updating Graph configuration:', error);
    return NextResponse.json(
      {
        error: 'UPDATE_ERROR',
        message: 'Erreur lors de la mise à jour de la configuration'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/graph-config
 * Désactiver Microsoft Graph
 */
export async function DELETE(request: NextRequest) {
  // Vérifier les permissions admin
  const adminCheck = await verifyAdmin(request);
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  try {
    const supabase = await createSupabaseServerClient();

    // Désactiver toutes les configurations
    const { error: deactivateError } = await supabase
      .from('microsoft_graph_config')
      .update({
        is_active: false,
        configuration_status: 'disabled',
        updated_at: new Date().toISOString()
      })
      .eq('is_active', true);

    if (deactivateError) {
      return NextResponse.json(
        {
          error: 'DEACTIVATE_ERROR',
          message: 'Erreur lors de la désactivation de Microsoft Graph'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Microsoft Graph a été désactivé avec succès'
    });

  } catch (error) {
    console.error('Error deactivating Microsoft Graph:', error);
    return NextResponse.json(
      {
        error: 'DEACTIVATE_ERROR',
        message: 'Erreur lors de la désactivation de Microsoft Graph'
      },
      { status: 500 }
    );
  }
}