/**
 * API Route pour le pixel de tracking d'ouverture d'emails
 * GET /api/tracking/pixel/[trackingId] - Pixel transparent pour détecter l'ouverture
 */

import { NextRequest, NextResponse } from 'next/server';
import { GraphMailSenderService } from '@/lib/services/graph/domain/graph-mail-sender-service';

/**
 * Créer un pixel transparent de 1x1
 */
function createTrackingPixel(): ArrayBuffer {
  // Pixel transparent PNG de 1x1 en base64
  const pixelBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  const pixelBuffer = Buffer.from(pixelBase64, 'base64');
  return pixelBuffer.buffer.slice(pixelBuffer.byteOffset, pixelBuffer.byteOffset + pixelBuffer.byteLength);
}

/**
 * Extraire les informations de la requête
 */
function extractRequestInfo(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || 'Unknown';
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded ? forwarded.split(',')[0] : realIp || 'Unknown';
  const referer = request.headers.get('referer') || 'Unknown';

  return {
    ip_address: ip,
    user_agent: userAgent,
    referer,
    timestamp: new Date().toISOString()
  };
}

/**
 * Détecter le type de device/client email
 */
function detectEmailClient(userAgent: string): string {
  const ua = userAgent.toLowerCase();

  if (ua.includes('outlook')) return 'Outlook';
  if (ua.includes('thunderbird')) return 'Thunderbird';
  if (ua.includes('apple mail') || ua.includes('mail/')) return 'Apple Mail';
  if (ua.includes('gmail')) return 'Gmail';
  if (ua.includes('yahoo')) return 'Yahoo Mail';
  if (ua.includes('mobile')) return 'Mobile Email Client';
  if (ua.includes('android')) return 'Android Email';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS Mail';
  if (ua.includes('webmail')) return 'Webmail Client';

  return 'Unknown Email Client';
}

/**
 * GET /api/tracking/pixel/[trackingId]
 * Servir le pixel de tracking et enregistrer l'ouverture
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> }
) {
  try {
    const { trackingId } = await params;

    // Extraire les informations de la requête
    const requestInfo = extractRequestInfo(request);
    const emailClient = detectEmailClient(requestInfo.user_agent);

    // Utiliser le service pour mettre à jour le statut
    const mailSenderService = GraphMailSenderService.getInstance();

    // Vérifier d'abord si le tracking existe
    const trackingStatus = await mailSenderService.getTrackingStatus(trackingId);

    if (trackingStatus.success && trackingStatus.data) {
      // Mettre à jour le statut seulement si ce n'est pas déjà ouvert
      if (trackingStatus.data.status === 'sent' || trackingStatus.data.status === 'delivered') {
        await mailSenderService.updateTrackingStatus(
          trackingId,
          'opened',
          {
            ...requestInfo,
            email_client: emailClient,
            first_open: true
          }
        );
      } else {
        // Ajouter un événement d'ouverture supplémentaire (multiple opens)
        const supabase = await import('@/lib/services/supabase-client').then(m => m.createClient());
        await supabase.from('email_tracking_events').insert({
          tracking_id: trackingId,
          event_type: 'opened',
          event_data: {
            ...requestInfo,
            email_client: emailClient,
            multiple_open: true
          },
          ip_address: requestInfo.ip_address,
          user_agent: requestInfo.user_agent,
          occurred_at: requestInfo.timestamp
        });
      }
    }

    // Toujours retourner le pixel, même si le tracking a échoué
    const pixelBuffer = createTrackingPixel();

    return new NextResponse(pixelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': pixelBuffer.byteLength.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Last-Modified': new Date().toUTCString(),
        // Headers pour éviter les problèmes CORS
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

  } catch (error) {
    console.error('Error in tracking pixel:', error);

    // Toujours retourner un pixel même en cas d'erreur pour ne pas casser l'affichage de l'email
    const pixelBuffer = createTrackingPixel();

    return new NextResponse(pixelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': pixelBuffer.byteLength.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }
}

/**
 * HEAD /api/tracking/pixel/[trackingId]
 * Certains clients email font des requêtes HEAD avant GET
 */
export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> }
) {
  // Simplement retourner les headers appropriés sans contenu
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': '43', // Taille du pixel
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

/**
 * OPTIONS /api/tracking/pixel/[trackingId]
 * Pour les requêtes CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, User-Agent, Referer',
      'Access-Control-Max-Age': '86400'
    }
  });
}