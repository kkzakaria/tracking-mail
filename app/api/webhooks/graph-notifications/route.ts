/**
 * API Route pour recevoir les webhooks Microsoft Graph
 * POST /api/webhooks/graph-notifications - Réception des notifications de changement
 */

import { NextRequest, NextResponse } from 'next/server';
import { GraphMailSenderService } from '@/lib/services/graph/domain/graph-mail-sender-service';
import { GraphClientFactory } from '@/lib/services/graph/core/graph-client-factory';
import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';
import crypto from 'crypto';

/**
 * Interface pour les notifications Microsoft Graph
 */
interface GraphNotification {
  subscriptionId: string;
  subscriptionExpirationDateTime: string;
  changeType: string;
  resource: string;
  resourceData: {
    '@odata.type': string;
    '@odata.id': string;
    id: string;
  };
  clientState?: string;
  tenantId: string;
}

/**
 * Interface pour le payload de validation Microsoft Graph
 */
interface ValidationRequest {
  validationToken: string;
}

/**
 * Vérifier la signature du webhook (si configurée)
 */
function verifyWebhookSignature(request: NextRequest, body: string): boolean {
  const signature = request.headers.get('x-ms-signature');
  const webhookSecret = process.env.GRAPH_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    // Si pas de signature configurée, on fait confiance (pour le développement)
    return true;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('base64');

    return signature === expectedSignature;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Vérifier le clientState pour s'assurer que la notification vient bien de notre subscription
 */
function verifyClientState(notification: GraphNotification): boolean {
  const expectedClientState = process.env.GRAPH_CLIENT_STATE || 'tracking-mail-webhook';
  return notification.clientState === expectedClientState;
}

/**
 * Analyser un message pour détecter s'il s'agit d'une réponse à un email tracké
 */
async function analyzeMessageForTracking(messageId: string, userId: string) {
  try {
    // Créer un client Graph pour récupérer le message
    const clientFactory = GraphClientFactory.getInstance();
    const clientResult = await clientFactory.createClientWithRetry();

    if (!clientResult.success || !clientResult.data) {
      console.error('Failed to create Graph client for message analysis');
      return null;
    }

    const client = clientResult.data;

    // Récupérer le message avec ses headers Internet
    const message = await client
      .api(`/users/${userId}/messages/${messageId}`)
      .select('internetMessageHeaders,subject,from,conversationId,receivedDateTime')
      .get();

    if (!message) {
      console.log('Message not found:', messageId);
      return null;
    }

    // Analyser les headers pour trouver in-reply-to et references
    const headers = message.internetMessageHeaders || [];
    const inReplyTo = headers.find((h: any) => h.name.toLowerCase() === 'in-reply-to')?.value;
    const references = headers.find((h: any) => h.name.toLowerCase() === 'references')?.value;
    const messageIdHeader = headers.find((h: any) => h.name.toLowerCase() === 'message-id')?.value;

    console.log('Analyzing message headers:', {
      messageId,
      inReplyTo,
      references,
      conversationId: message.conversationId,
      subject: message.subject
    });

    // Chercher un email tracké correspondant
    const supabase = await createSupabaseServerClient();

    let trackedEmail = null;

    // 1. Chercher par message_id exact (si le message original était tracké)
    if (inReplyTo) {
      const { data: tracking1 } = await supabase
        .from('email_tracking')
        .select('*')
        .eq('message_id', inReplyTo.replace(/[<>]/g, ''))
        .single();

      if (tracking1) {
        trackedEmail = tracking1;
        console.log('Found tracked email by in-reply-to:', tracking1.tracking_id);
      }
    }

    // 2. Chercher par conversation_id si pas trouvé
    if (!trackedEmail && message.conversationId) {
      const { data: tracking2 } = await supabase
        .from('email_tracking')
        .select('*')
        .eq('conversation_id', message.conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (tracking2) {
        trackedEmail = tracking2;
        console.log('Found tracked email by conversation_id:', tracking2.tracking_id);
      }
    }

    // 3. Chercher par recipient_email et sujet similaire
    if (!trackedEmail && message.from?.emailAddress?.address) {
      const { data: tracking3 } = await supabase
        .from('email_tracking')
        .select('*')
        .eq('recipient_email', message.from.emailAddress.address)
        .eq('status', 'sent')
        .order('created_at', { ascending: false })
        .limit(5);

      // Vérifier si le sujet correspond à une réponse
      if (tracking3 && tracking3.length > 0) {
        for (const track of tracking3) {
          // Le sujet de réponse contient souvent "RE:" ou "Re:" suivi du sujet original
          const subjectMatch = message.subject?.toLowerCase().includes('re:') ||
                              message.subject?.toLowerCase().includes('reply');

          if (subjectMatch) {
            trackedEmail = track;
            console.log('Found tracked email by recipient and subject pattern:', track.tracking_id);
            break;
          }
        }
      }
    }

    if (trackedEmail) {
      return {
        tracking: trackedEmail,
        replyMessage: {
          messageId,
          subject: message.subject,
          from: message.from?.emailAddress?.address,
          receivedDateTime: message.receivedDateTime,
          conversationId: message.conversationId,
          inReplyTo,
          references
        }
      };
    }

    return null;

  } catch (error) {
    console.error('Error analyzing message for tracking:', error);
    return null;
  }
}

/**
 * Traiter une notification de nouveau message
 */
async function processMessageNotification(notification: GraphNotification) {
  try {
    console.log('Processing message notification:', {
      subscriptionId: notification.subscriptionId,
      resource: notification.resource,
      changeType: notification.changeType
    });

    // Extraire l'ID du message et l'utilisateur de la resource
    const resourceParts = notification.resource.split('/');
    const userIndex = resourceParts.findIndex(part => part === 'users');
    const messagesIndex = resourceParts.findIndex(part => part === 'messages');

    if (userIndex === -1 || messagesIndex === -1 || userIndex + 1 >= resourceParts.length) {
      console.log('Invalid resource format:', notification.resource);
      return;
    }

    const userId = resourceParts[userIndex + 1];
    const messageId = notification.resourceData.id;

    console.log('Extracted from notification:', { userId, messageId });

    // Analyser le message pour voir s'il s'agit d'une réponse à un email tracké
    const analysisResult = await analyzeMessageForTracking(messageId, userId);

    if (analysisResult) {
      console.log('Found reply to tracked email:', {
        trackingId: analysisResult.tracking.tracking_id,
        originalRecipient: analysisResult.tracking.recipient_email,
        replyFrom: analysisResult.replyMessage.from
      });

      // Mettre à jour le statut de tracking
      const mailSenderService = GraphMailSenderService.getInstance();
      const updateResult = await mailSenderService.updateTrackingStatus(
        analysisResult.tracking.tracking_id,
        'replied',
        {
          reply_message_id: messageId,
          reply_from: analysisResult.replyMessage.from,
          reply_subject: analysisResult.replyMessage.subject,
          reply_received_at: analysisResult.replyMessage.receivedDateTime,
          conversation_id: analysisResult.replyMessage.conversationId,
          detection_method: 'webhook'
        }
      );

      if (updateResult.success) {
        console.log('Successfully updated tracking status to replied');
      } else {
        console.error('Failed to update tracking status:', updateResult.error);
      }
    } else {
      console.log('No tracked email found for this message');
    }

  } catch (error) {
    console.error('Error processing message notification:', error);
  }
}

/**
 * GET /api/webhooks/graph-notifications
 * Validation du webhook par Microsoft Graph
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const validationToken = searchParams.get('validationToken');

    if (validationToken) {
      console.log('Webhook validation requested');
      return new NextResponse(validationToken, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain'
        }
      });
    }

    return NextResponse.json(
      { error: 'NO_VALIDATION_TOKEN', message: 'Token de validation manquant' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Error in webhook validation:', error);
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'Erreur lors de la validation' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/webhooks/graph-notifications
 * Traitement des notifications Microsoft Graph
 */
export async function POST(request: NextRequest) {
  try {
    // Lire le body de la requête
    const bodyText = await request.text();

    // Vérifier la signature si configurée
    if (!verifyWebhookSignature(request, bodyText)) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'INVALID_SIGNATURE', message: 'Signature webhook invalide' },
        { status: 401 }
      );
    }

    // Parser le JSON
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (error) {
      console.error('Invalid JSON in webhook:', error);
      return NextResponse.json(
        { error: 'INVALID_JSON', message: 'Format JSON invalide' },
        { status: 400 }
      );
    }

    // Traiter chaque notification
    const notifications: GraphNotification[] = body.value || [];

    console.log(`Received ${notifications.length} notifications`);

    for (const notification of notifications) {
      try {
        // Vérifier le clientState
        if (!verifyClientState(notification)) {
          console.warn('Invalid client state for notification:', notification.subscriptionId);
          continue;
        }

        // Traiter seulement les notifications de messages
        if (notification.resource.includes('/messages') && notification.changeType === 'created') {
          await processMessageNotification(notification);
        } else {
          console.log('Ignoring notification:', {
            resource: notification.resource,
            changeType: notification.changeType
          });
        }

      } catch (error) {
        console.error('Error processing individual notification:', error);
        // Continuer avec les autres notifications
      }
    }

    // Retourner succès à Microsoft Graph
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in webhook processing:', error);
    return NextResponse.json(
      { error: 'WEBHOOK_ERROR', message: 'Erreur lors du traitement du webhook' },
      { status: 500 }
    );
  }
}