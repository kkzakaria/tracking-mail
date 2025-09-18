/**
 * API pour les statistiques optimisées des boîtes emails
 * GET /api/user/mailbox-stats - Obtenir les statistiques de comptage sans récupérer les messages
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdminGraphService } from '@/lib/services/admin-graph-service';
import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';

/**
 * Vérifier que l'utilisateur est authentifié
 */
async function verifyAuth(request: NextRequest) {
  console.log('🔒 API mailbox-stats verifyAuth: Starting verification');
  const supabase = await createSupabaseServerClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  console.log('🔒 API mailbox-stats verifyAuth: getUser result', {
    user: !!user,
    userId: user?.id,
    email: user?.email,
    error: userError?.message
  });

  if (userError || !user) {
    console.log('🔒 API mailbox-stats verifyAuth: Auth failed', userError);
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentification requise' }, { status: 401 });
  }

  // Vérifier que l'utilisateur a un profil actif
  console.log('🔒 API mailbox-stats verifyAuth: Checking user profile for', user.id);
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .eq('is_active', true)
    .single();

  console.log('🔒 API mailbox-stats verifyAuth: Profile check result', {
    profile: !!profile,
    profileId: profile?.id,
    isActive: profile?.is_active,
    error: profileError?.message
  });

  if (profileError || !profile) {
    console.log('🔒 API mailbox-stats verifyAuth: Profile not found or inactive');
    return NextResponse.json({ error: 'PROFILE_NOT_FOUND', message: 'Profil utilisateur non trouvé ou inactif' }, { status: 403 });
  }

  console.log('🔒 API mailbox-stats verifyAuth: Verification successful');
  return { userId: user.id, profile };
}

/**
 * GET /api/user/mailbox-stats
 * Obtenir les statistiques optimisées des boîtes emails assignées à l'utilisateur
 */
export async function GET(request: NextRequest) {
  console.log('📊 API mailbox-stats: GET request received');
  const authCheck = await verifyAuth(request);
  if (authCheck instanceof NextResponse) {
    console.log('📊 API mailbox-stats: Auth check failed, returning response');
    return authCheck;
  }

  const { userId, profile } = authCheck;
  console.log('📊 API mailbox-stats: Auth check passed', { userId, profileEmail: profile.email });

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate'); // ISO date string (e.g., "2025-01-01T00:00:00Z")
    const endDate = searchParams.get('endDate');     // ISO date string (e.g., "2025-01-31T23:59:59Z")
    const includeChildFolders = searchParams.get('includeChildFolders') === 'true';
    const onlyUserFolders = searchParams.get('onlyUserFolders') === 'true';
    const quickStats = searchParams.get('quickStats') === 'true';

    console.log('📊 API mailbox-stats: Query parameters', {
      startDate,
      endDate,
      includeChildFolders,
      onlyUserFolders,
      quickStats
    });

    const supabase = await createSupabaseServerClient();

    // Obtenir les assignations actives de l'utilisateur
    const { data: assignments, error: assignmentError } = await supabase
      .from('user_mailbox_assignments')
      .select(`
        id,
        permission_level,
        mailboxes!inner(
          id,
          email_address,
          display_name,
          is_active
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('mailboxes.is_active', true);

    if (assignmentError) {
      console.error('📊 API mailbox-stats: Assignment error:', assignmentError);
      return NextResponse.json(
        { error: 'FETCH_ERROR', message: 'Erreur lors de la récupération de vos boîtes emails' },
        { status: 500 }
      );
    }

    const mailboxes = assignments || [];
    console.log('📊 API mailbox-stats: Found', mailboxes.length, 'assigned mailboxes');

    if (mailboxes.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          mailboxes: [],
          totalStats: {
            totalMessages: 0,
            unreadMessages: 0,
            mailboxCount: 0
          },
          user: {
            id: profile.id,
            email: profile.email,
            displayName: profile.display_name || profile.full_name
          }
        }
      });
    }

    // Initialiser le service Graph
    console.log('📊 API mailbox-stats: Initializing AdminGraphService...');
    const adminGraphService = AdminGraphService.getInstance();
    const initResult = await adminGraphService.initialize();

    console.log('📊 API mailbox-stats: AdminGraphService init result:', {
      success: initResult.success,
      error: initResult.error?.code,
      message: initResult.error?.message
    });

    if (!initResult.success) {
      console.log('📊 API mailbox-stats: Microsoft Graph not configured, returning error');
      return NextResponse.json({
        success: false,
        error: 'GRAPH_NOT_CONFIGURED',
        message: 'Microsoft Graph n\'est pas configuré'
      }, { status: 503 });
    }

    console.log('📊 API mailbox-stats: Microsoft Graph configured successfully, fetching stats');

    // Récupérer les statistiques pour chaque boîte (en parallèle pour la performance)
    const mailboxPromises = mailboxes.map(async (assignment) => {
      const emailAddress = assignment.mailboxes.email_address;
      console.log(`📊 API mailbox-stats: Fetching stats for ${emailAddress} with options:`, {
        startDate,
        endDate,
        includeChildFolders,
        onlyUserFolders,
        quickStats
      });

      try {
        let statsResult;

        if (quickStats) {
          // Utiliser les statistiques rapides (sans sous-dossiers, dossiers principaux seulement)
          statsResult = await adminGraphService.getMailboxQuickStats(emailAddress);
        } else {
          // Utiliser les statistiques complètes avec options
          statsResult = await adminGraphService.getMailboxStatsForPeriod(emailAddress, {
            startDate,
            endDate,
            includeChildFolders,
            onlyUserFolders
          });
        }

        console.log(`📊 API mailbox-stats: Stats result for ${emailAddress}:`, {
          success: statsResult.success,
          totalMessages: statsResult.success ? statsResult.data?.totalMessages : 0,
          unreadMessages: statsResult.success ? statsResult.data?.unreadMessages : 0,
          foldersCount: statsResult.success ? statsResult.data?.folders.length : 0,
          error: statsResult.error?.code,
          errorMessage: statsResult.error?.message
        });

        return {
          ...assignment,
          stats: statsResult.success ? statsResult.data : null,
          statsError: statsResult.success ? null : statsResult.error?.message
        };
      } catch (error) {
        console.error(`📊 API mailbox-stats: Exception getting stats for ${emailAddress}:`, error);
        return {
          ...assignment,
          stats: null,
          statsError: 'Erreur lors de la récupération des statistiques'
        };
      }
    });

    const mailboxesWithStats = await Promise.all(mailboxPromises);

    // Calculer les totaux globaux
    const totalStats = mailboxesWithStats.reduce(
      (acc, mailboxData) => {
        if (mailboxData.stats) {
          acc.totalMessages += mailboxData.stats.totalMessages;
          acc.unreadMessages += mailboxData.stats.unreadMessages;
        }
        acc.mailboxCount++;
        return acc;
      },
      { totalMessages: 0, unreadMessages: 0, mailboxCount: 0 }
    );

    console.log('📊 API mailbox-stats: Global totals:', totalStats);

    // Logger l'accès aux statistiques
    await supabase
      .from('user_activity_logs')
      .insert({
        user_id: userId,
        activity_type: 'mailbox_stats_access',
        activity_description: `Consultation des statistiques de ${mailboxes.length} boîtes`,
        metadata: {
          mailbox_count: mailboxes.length,
          quick_stats: quickStats,
          period_filter: startDate || endDate ? { startDate, endDate } : null,
          include_child_folders: includeChildFolders,
          only_user_folders: onlyUserFolders
        }
      });

    return NextResponse.json({
      success: true,
      data: {
        mailboxes: mailboxesWithStats,
        totalStats,
        user: {
          id: profile.id,
          email: profile.email,
          displayName: profile.display_name || profile.full_name
        },
        queryOptions: {
          startDate,
          endDate,
          includeChildFolders,
          onlyUserFolders,
          quickStats
        }
      }
    });

  } catch (error) {
    console.error('📊 API mailbox-stats: Error getting mailbox stats:', error);
    return NextResponse.json(
      { error: 'GET_MAILBOX_STATS_ERROR', message: 'Erreur lors de la récupération des statistiques' },
      { status: 500 }
    );
  }
}