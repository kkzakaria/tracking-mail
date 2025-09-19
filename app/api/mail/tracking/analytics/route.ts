/**
 * API Route pour les analytics de tracking d'emails
 * GET /api/mail/tracking/analytics - Obtenir les analytics de tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';
import { GraphStatsService } from '@/lib/services/graph/domain/graph-stats-service';
import type { AnalyticsOptions } from '@/lib/types/email-tracking';

/**
 * Vérifier l'authentification de l'utilisateur
 */
async function verifyAuth(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentification requise' },
      { status: 401 }
    );
  }

  return { user };
}

/**
 * Parser et valider les paramètres de requête
 */
function parseAnalyticsParams(searchParams: URLSearchParams): AnalyticsOptions {
  const period = searchParams.get('period') as 'day' | 'week' | 'month' | 'year' || 'month';
  const startDate = searchParams.get('start_date') || undefined;
  const endDate = searchParams.get('end_date') || undefined;
  const recipientFilter = searchParams.get('recipient_filter') || undefined;
  const includeDeviceStats = searchParams.get('include_device_stats') === 'true';
  const includeTimeAnalysis = searchParams.get('include_time_analysis') === 'true';

  // Validation de la période
  const validPeriods = ['day', 'week', 'month', 'year'];
  if (!validPeriods.includes(period)) {
    throw new Error(`Période invalide: ${period}. Valeurs acceptées: ${validPeriods.join(', ')}`);
  }

  // Validation des dates si fournies
  if (startDate && isNaN(Date.parse(startDate))) {
    throw new Error('Format de start_date invalide. Utilisez le format ISO (YYYY-MM-DD)');
  }

  if (endDate && isNaN(Date.parse(endDate))) {
    throw new Error('Format de end_date invalide. Utilisez le format ISO (YYYY-MM-DD)');
  }

  // Validation de la logique des dates
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      throw new Error('start_date doit être antérieure à end_date');
    }
  }

  return {
    period,
    start_date: startDate,
    end_date: endDate,
    recipient_filter: recipientFilter,
    include_device_stats: includeDeviceStats,
    include_time_analysis: includeTimeAnalysis
  };
}

/**
 * GET /api/mail/tracking/analytics
 * Obtenir les analytics de tracking d'emails
 */
export async function GET(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const authResult = await verifyAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { user } = authResult;

    // Parser les paramètres de requête
    const { searchParams } = new URL(request.url);

    let analyticsOptions: AnalyticsOptions;
    try {
      analyticsOptions = parseAnalyticsParams(searchParams);
    } catch (error) {
      return NextResponse.json(
        {
          error: 'INVALID_PARAMETERS',
          message: error instanceof Error ? error.message : 'Paramètres invalides'
        },
        { status: 400 }
      );
    }

    // Utiliser le service de stats pour générer les analytics
    const statsService = GraphStatsService.getInstance();

    const analyticsResult = await statsService.getEmailTrackingAnalytics(
      user.email || user.id,
      analyticsOptions
    );

    if (!analyticsResult.success) {
      console.error('Failed to generate analytics:', analyticsResult.error);
      return NextResponse.json(
        {
          error: analyticsResult.error?.code || 'ANALYTICS_ERROR',
          message: analyticsResult.error?.message || 'Erreur lors de la génération des analytics'
        },
        { status: 500 }
      );
    }

    // Logger l'activité de consultation
    const supabase = await createSupabaseServerClient();
    await supabase
      .from('user_activity_logs')
      .insert({
        user_id: user.id,
        activity_type: 'analytics_viewed',
        activity_description: `Analytics de tracking consultées pour la période: ${analyticsOptions.period}`,
        resource_type: 'analytics',
        metadata: {
          period: analyticsOptions.period,
          start_date: analyticsOptions.start_date,
          end_date: analyticsOptions.end_date,
          recipient_filter: analyticsOptions.recipient_filter,
          include_device_stats: analyticsOptions.include_device_stats,
          include_time_analysis: analyticsOptions.include_time_analysis
        }
      });

    return NextResponse.json({
      success: true,
      data: analyticsResult.data,
      metadata: {
        generated_at: new Date().toISOString(),
        user_id: user.id,
        parameters: analyticsOptions
      }
    });

  } catch (error) {
    console.error('Error in tracking analytics API:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

/**
 * GET - Documentation endpoint
 */
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/api/mail/tracking/analytics',
    method: 'GET',
    description: 'Obtenir les analytics de tracking d\'emails pour l\'utilisateur authentifié',
    parameters: {
      period: {
        type: 'string',
        required: false,
        default: 'month',
        values: ['day', 'week', 'month', 'year'],
        description: 'Période d\'analyse'
      },
      start_date: {
        type: 'string',
        required: false,
        format: 'YYYY-MM-DD',
        description: 'Date de début (optionnel si period est spécifié)'
      },
      end_date: {
        type: 'string',
        required: false,
        format: 'YYYY-MM-DD',
        description: 'Date de fin (optionnel si period est spécifié)'
      },
      recipient_filter: {
        type: 'string',
        required: false,
        description: 'Filtre sur l\'adresse email du destinataire (recherche partielle)'
      },
      include_device_stats: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Inclure les statistiques par device/client email'
      },
      include_time_analysis: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Inclure l\'analyse d\'activité par heure'
      }
    },
    response: {
      success: 'boolean',
      data: {
        period: 'string - Période analysée',
        start_date: 'string - Date de début',
        end_date: 'string - Date de fin',
        metrics: {
          emails_sent: 'number - Nombre d\'emails envoyés',
          emails_delivered: 'number - Nombre d\'emails délivrés',
          emails_opened: 'number - Nombre d\'emails ouverts',
          emails_clicked: 'number - Nombre d\'emails avec clics',
          emails_replied: 'number - Nombre de réponses reçues',
          emails_bounced: 'number - Nombre d\'emails en erreur',
          open_rate: 'number - Taux d\'ouverture (0-1)',
          click_rate: 'number - Taux de clic (0-1)',
          reply_rate: 'number - Taux de réponse (0-1)',
          bounce_rate: 'number - Taux d\'erreur (0-1)',
          top_recipients: 'Array - Top 10 des destinataires',
          activity_by_hour: 'Array - Activité par heure (si demandé)',
          device_stats: 'Array - Statistiques par device (si demandé)'
        }
      },
      metadata: {
        generated_at: 'string - Date de génération',
        user_id: 'string - ID utilisateur',
        parameters: 'object - Paramètres utilisés'
      }
    },
    examples: {
      basic: '/api/mail/tracking/analytics?period=month',
      detailed: '/api/mail/tracking/analytics?period=week&include_device_stats=true&include_time_analysis=true',
      filtered: '/api/mail/tracking/analytics?period=month&recipient_filter=example.com',
      custom_dates: '/api/mail/tracking/analytics?start_date=2024-01-01&end_date=2024-01-31'
    },
    rate_limits: {
      authenticated: '100 requests per hour',
      burst: '10 requests per minute'
    }
  });
}