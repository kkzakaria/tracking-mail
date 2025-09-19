/**
 * API Route pour consulter le statut de tracking d'un email
 * GET /api/mail/tracking/[trackingId] - Obtenir le statut de tracking
 * PUT /api/mail/tracking/[trackingId] - Mettre à jour le statut de tracking (webhook usage)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';
import { GraphMailSenderService } from '@/lib/services/graph/domain/graph-mail-sender-service';
import type { TrackingStatus, TrackingEventType } from '@/lib/types/email-tracking';

/**
 * Vérifier l'authentification pour GET (consultation)
 */
async function verifyAuthForRead(request: NextRequest, trackingId: string) {
  const supabase = await createSupabaseServerClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentification requise' },
      { status: 401 }
    );
  }

  // Vérifier que l'utilisateur peut accéder à ce tracking
  const { data: tracking, error: trackingError } = await supabase
    .from('email_tracking')
    .select('*')
    .eq('tracking_id', trackingId)
    .eq('user_id', user.email) // L'utilisateur peut seulement voir ses propres trackings
    .single();

  if (trackingError || !tracking) {
    return NextResponse.json(
      { error: 'TRACKING_NOT_FOUND', message: 'Tracking non trouvé ou accès refusé' },
      { status: 404 }
    );
  }

  return { user, tracking };
}

/**
 * Vérifier les permissions admin pour PUT (webhook)
 */
async function verifyWebhookAuth(request: NextRequest) {
  // Vérifier le secret webhook dans les headers
  const webhookSecret = request.headers.get('x-webhook-secret');
  const expectedSecret = process.env.WEBHOOK_SECRET;

  if (!webhookSecret || !expectedSecret || webhookSecret !== expectedSecret) {
    // Fallback: vérifier l'authentification utilisateur standard
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentification webhook ou utilisateur requise' },
        { status: 401 }
      );
    }

    return { authenticated: true, isWebhook: false, user };
  }

  return { authenticated: true, isWebhook: true };
}

/**
 * GET /api/mail/tracking/[trackingId]
 * Obtenir le statut de tracking d'un email
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> }
) {
  try {
    const { trackingId } = await params;

    // Vérifier l'authentification
    const authResult = await verifyAuthForRead(request, trackingId);
    if (authResult instanceof NextResponse) return authResult;

    const { user, tracking } = authResult;

    // Utiliser le service pour obtenir les détails complets
    const mailSenderService = GraphMailSenderService.getInstance();
    const trackingResult = await mailSenderService.getTrackingStatus(trackingId);

    if (!trackingResult.success) {
      return NextResponse.json(
        {
          error: trackingResult.error?.code || 'TRACKING_ERROR',
          message: trackingResult.error?.message || 'Erreur lors de la récupération du tracking'
        },
        { status: 500 }
      );
    }

    // Récupérer les événements de tracking
    const supabase = await createSupabaseServerClient();
    const { data: events, error: eventsError } = await supabase
      .from('email_tracking_events')
      .select('*')
      .eq('tracking_id', trackingId)
      .order('occurred_at', { ascending: false });

    if (eventsError) {
      console.warn('Failed to fetch tracking events:', eventsError);
    }

    const trackingData = trackingResult.data!;

    return NextResponse.json({
      success: true,
      data: {
        tracking: {
          id: trackingData.id,
          tracking_id: trackingData.tracking_id,
          message_id: trackingData.message_id,
          recipient_email: trackingData.recipient_email,
          sent_at: trackingData.sent_at,
          status: trackingData.status,
          opened_at: trackingData.opened_at,
          clicked_at: trackingData.clicked_at,
          reply_detected_at: trackingData.reply_detected_at,
          pixel_url: trackingData.pixel_url,
          metadata: trackingData.metadata,
          created_at: trackingData.created_at,
          updated_at: trackingData.updated_at
        },
        events: events || [],
        statistics: {
          total_events: events?.length || 0,
          has_opened: !!trackingData.opened_at,
          has_clicked: !!trackingData.clicked_at,
          has_replied: !!trackingData.reply_detected_at,
          days_since_sent: Math.floor(
            (new Date().getTime() - new Date(trackingData.sent_at).getTime()) / (1000 * 60 * 60 * 24)
          )
        }
      }
    });

  } catch (error) {
    console.error('Error in tracking GET:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/mail/tracking/[trackingId]
 * Mettre à jour le statut de tracking (utilisé par webhooks)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> }
) {
  try {
    const { trackingId } = await params;

    // Vérifier l'authentification webhook
    const authResult = await verifyWebhookAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    // Parser le body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'INVALID_JSON', message: 'Format JSON invalide' },
        { status: 400 }
      );
    }

    const { status, event_data, ip_address, user_agent } = body;

    // Valider le statut
    const validStatuses: TrackingStatus[] = ['sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'INVALID_STATUS', message: 'Statut de tracking invalide' },
        { status: 400 }
      );
    }

    // Utiliser le service pour mettre à jour
    const mailSenderService = GraphMailSenderService.getInstance();
    const updateResult = await mailSenderService.updateTrackingStatus(
      trackingId,
      status,
      {
        ...event_data,
        ip_address,
        user_agent
      }
    );

    if (!updateResult.success) {
      return NextResponse.json(
        {
          error: updateResult.error?.code || 'UPDATE_ERROR',
          message: updateResult.error?.message || 'Erreur lors de la mise à jour'
        },
        { status: 500 }
      );
    }

    // Logger l'activité si ce n'est pas un webhook automatique
    if (!authResult.isWebhook && authResult.user) {
      const supabase = await createSupabaseServerClient();
      await supabase
        .from('user_activity_logs')
        .insert({
          user_id: authResult.user.id,
          activity_type: 'tracking_updated',
          activity_description: `Statut de tracking mis à jour: ${status}`,
          resource_id: trackingId,
          resource_type: 'email_tracking',
          metadata: {
            new_status: status,
            event_data: event_data || {},
            ip_address,
            user_agent
          }
        });
    }

    return NextResponse.json({
      success: true,
      data: {
        tracking_id: trackingId,
        status,
        updated_at: new Date().toISOString()
      },
      message: `Statut de tracking mis à jour: ${status}`
    });

  } catch (error) {
    console.error('Error in tracking PUT:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mail/tracking/[trackingId]
 * Ajouter un événement de tracking (pour usage interne)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> }
) {
  try {
    const { trackingId } = await params;

    // Vérifier l'authentification webhook
    const authResult = await verifyWebhookAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    // Parser le body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'INVALID_JSON', message: 'Format JSON invalide' },
        { status: 400 }
      );
    }

    const { event_type, event_data, ip_address, user_agent } = body;

    // Valider le type d'événement
    const validEventTypes: TrackingEventType[] = ['sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'unsubscribed'];
    if (!event_type || !validEventTypes.includes(event_type)) {
      return NextResponse.json(
        { error: 'INVALID_EVENT_TYPE', message: 'Type d\'événement invalide' },
        { status: 400 }
      );
    }

    // Ajouter l'événement en base
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('email_tracking_events')
      .insert({
        tracking_id: trackingId,
        event_type,
        event_data: event_data || {},
        ip_address,
        user_agent,
        occurred_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'CREATE_EVENT_ERROR', message: 'Erreur lors de la création de l\'événement' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: `Événement de tracking ajouté: ${event_type}`
    });

  } catch (error) {
    console.error('Error in tracking POST:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}