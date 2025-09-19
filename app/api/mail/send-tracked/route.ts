/**
 * API Route pour l'envoi d'emails avec tracking
 * POST /api/mail/send-tracked - Envoyer un email avec tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';
import { GraphMailSenderService } from '@/lib/services/graph/domain/graph-mail-sender-service';
import type { SendWithTrackingOptions } from '@/lib/types/email-tracking';

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

  // Vérifier que l'utilisateur a un profil actif
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'PROFILE_NOT_FOUND', message: 'Profil utilisateur non trouvé' },
      { status: 404 }
    );
  }

  return { user, profile };
}

/**
 * Valider les données d'entrée
 */
function validateTrackingRequest(body: any): { isValid: boolean; error?: string; data?: SendWithTrackingOptions } {
  const { recipient, subject, bodyContent, isHtml, enableTracking, trackOpens, trackLinks, customMetadata, webhookUrl } = body;

  if (!recipient) {
    return { isValid: false, error: 'recipient est requis' };
  }

  if (!subject) {
    return { isValid: false, error: 'subject est requis' };
  }

  if (!bodyContent) {
    return { isValid: false, error: 'bodyContent est requis' };
  }

  // Validation du format email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipient)) {
    return { isValid: false, error: 'Format d\'email invalide pour recipient' };
  }

  // Validation de la longueur du sujet
  if (subject.length > 255) {
    return { isValid: false, error: 'Le sujet ne peut pas dépasser 255 caractères' };
  }

  // Validation du webhook URL si fourni
  if (webhookUrl && !webhookUrl.startsWith('https://')) {
    return { isValid: false, error: 'L\'URL de webhook doit utiliser HTTPS' };
  }

  const trackingOptions: SendWithTrackingOptions = {
    recipient,
    subject,
    body: bodyContent,
    isHtml: isHtml === true,
    enableTracking: enableTracking === true,
    trackOpens: trackOpens === true,
    trackLinks: trackLinks === true,
    customMetadata: customMetadata || {},
    webhookUrl
  };

  return { isValid: true, data: trackingOptions };
}

/**
 * POST /api/mail/send-tracked
 * Envoyer un email avec tracking
 */
export async function POST(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const authResult = await verifyAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { user, profile } = authResult;

    // Parser et valider le body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'INVALID_JSON', message: 'Format JSON invalide' },
        { status: 400 }
      );
    }

    // Valider les données
    const validation = validateTrackingRequest(body);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: validation.error },
        { status: 400 }
      );
    }

    const trackingOptions = validation.data!;

    // Vérifier si l'utilisateur a une adresse email valide
    if (!user.email) {
      return NextResponse.json(
        { error: 'NO_EMAIL', message: 'Adresse email utilisateur manquante' },
        { status: 400 }
      );
    }

    // Initialiser le service d'envoi
    const mailSenderService = GraphMailSenderService.getInstance();

    // Envoyer l'email avec tracking
    const sendResult = await mailSenderService.sendMailWithTracking(
      user.email,
      trackingOptions
    );

    if (!sendResult.success) {
      console.error('Failed to send tracked email:', sendResult.error);
      return NextResponse.json(
        {
          error: sendResult.error?.code || 'SEND_ERROR',
          message: sendResult.error?.message || 'Erreur lors de l\'envoi de l\'email'
        },
        { status: 500 }
      );
    }

    // Logger l'activité d'envoi
    const supabase = await createSupabaseServerClient();
    await supabase
      .from('user_activity_logs')
      .insert({
        user_id: user.id,
        activity_type: 'email_sent',
        activity_description: `Email ${trackingOptions.enableTracking ? 'avec tracking' : 'sans tracking'} envoyé à ${trackingOptions.recipient}`,
        resource_id: sendResult.data?.messageId,
        resource_type: 'email',
        metadata: {
          recipient: trackingOptions.recipient,
          subject: trackingOptions.subject,
          tracking_enabled: trackingOptions.enableTracking,
          tracking_id: sendResult.data?.trackingId,
          has_webhook: !!trackingOptions.webhookUrl
        }
      });

    return NextResponse.json({
      success: true,
      data: {
        messageId: sendResult.data?.messageId,
        trackingId: sendResult.data?.trackingId,
        status: sendResult.data?.status,
        trackingUrl: sendResult.data?.tracking_url,
        recipient: trackingOptions.recipient,
        subject: trackingOptions.subject,
        sentAt: new Date().toISOString(),
        trackingEnabled: trackingOptions.enableTracking
      },
      message: `Email envoyé avec succès ${trackingOptions.enableTracking ? 'avec tracking' : ''}`
    });

  } catch (error) {
    console.error('Error in send-tracked API:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/mail/send-tracked
 * Retourner les informations sur l'endpoint (pour documentation)
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/api/mail/send-tracked',
    method: 'POST',
    description: 'Envoyer un email avec options de tracking',
    parameters: {
      recipient: 'string (required) - Adresse email du destinataire',
      subject: 'string (required) - Sujet de l\'email',
      bodyContent: 'string (required) - Contenu de l\'email',
      isHtml: 'boolean (optional) - Si le contenu est en HTML (défaut: false)',
      enableTracking: 'boolean (optional) - Activer le tracking (défaut: false)',
      trackOpens: 'boolean (optional) - Tracker les ouvertures (défaut: false)',
      trackLinks: 'boolean (optional) - Tracker les clics sur liens (défaut: false)',
      customMetadata: 'object (optional) - Métadonnées personnalisées',
      webhookUrl: 'string (optional) - URL de webhook pour les notifications'
    },
    response: {
      success: 'boolean',
      data: {
        messageId: 'string - ID du message envoyé',
        trackingId: 'string | undefined - ID de tracking si activé',
        status: 'string - Statut d\'envoi',
        trackingUrl: 'string | undefined - URL de suivi si tracking activé',
        recipient: 'string - Destinataire',
        subject: 'string - Sujet',
        sentAt: 'string - Date d\'envoi',
        trackingEnabled: 'boolean - Si le tracking est activé'
      },
      message: 'string - Message de confirmation'
    },
    example: {
      request: {
        recipient: 'destinataire@example.com',
        subject: 'Test avec tracking',
        bodyContent: '<p>Bonjour, ceci est un test avec tracking.</p>',
        isHtml: true,
        enableTracking: true,
        trackOpens: true,
        trackLinks: true,
        customMetadata: { campaign: 'test-campaign' }
      }
    }
  });
}