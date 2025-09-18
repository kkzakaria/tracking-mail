/**
 * API Route pour envoyer des relances automatiques
 * POST /api/admin/mailboxes/[id]/send-followup - Envoyer une relance pour un email
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/lib/utils/supabase/server';

/**
 * Vérifier les permissions admin
 */
async function verifyAdmin(_request: NextRequest) {
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
 * Générer un template de relance
 */
function generateFollowUpTemplate(originalSubject: string, daysSince: number): string {
  const templates = {
    gentle: `
<p>Bonjour,</p>

<p>J'espère que vous allez bien. Je me permets de revenir vers vous concernant mon message précédent au sujet de : <strong>${originalSubject}</strong></p>

<p>Je serais ravi d'avoir votre retour à ce sujet. N'hésitez pas à me faire savoir si vous avez besoin d'informations complémentaires.</p>

<p>Je vous remercie par avance pour votre attention.</p>

<p>Cordialement</p>
    `,
    urgent: `
<p>Bonjour,</p>

<p>Je me permets de vous relancer concernant mon message du ${new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR')} au sujet de : <strong>${originalSubject}</strong></p>

<p>Votre retour serait très apprécié pour pouvoir avancer sur ce dossier.</p>

<p>Je reste à votre disposition pour toute question.</p>

<p>Cordialement</p>
    `
  };

  return daysSince > 7 ? templates.urgent : templates.gentle;
}

/**
 * POST /api/admin/mailboxes/[id]/send-followup
 * Envoyer une relance pour un email spécifique
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await verifyAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    const body = await request.json();
    const {
      originalMessageId,
      originalSubject,
      recipientEmail,
      daysSince,
      customMessage,
      importance = 'normal'
    } = body;

    if (!originalMessageId || !originalSubject || !recipientEmail) {
      return NextResponse.json(
        { error: 'MISSING_REQUIRED_FIELDS', message: 'ID du message, sujet et destinataire requis' },
        { status: 400 }
      );
    }

    // Vérifier la mailbox
    const supabase = await createSupabaseServerClient();
    const { data: mailbox, error: mailboxError } = await supabase
      .from('mailboxes')
      .select('*')
      .eq('id', params.id)
      .eq('is_active', true)
      .single();

    if (mailboxError || !mailbox) {
      return NextResponse.json(
        { error: 'MAILBOX_NOT_FOUND', message: 'Boîte email non trouvée ou inactive' },
        { status: 404 }
      );
    }

    // Configurer Microsoft Graph
    const { ConfidentialClientApplication } = await import('@azure/msal-node');

    const config = {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      tenantId: process.env.MICROSOFT_TENANT_ID!
    };

    const client = new ConfidentialClientApplication({
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`
      }
    });

    // Acquérir un token
    const response = await client.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default']
    });

    if (!response?.accessToken) {
      return NextResponse.json(
        { error: 'GRAPH_TOKEN_ERROR', message: 'Impossible d\'obtenir un token Microsoft Graph' },
        { status: 503 }
      );
    }

    // Préparer le message de relance
    const followUpSubject = `Relance: ${originalSubject}`;
    const followUpBody = customMessage || generateFollowUpTemplate(originalSubject, daysSince);

    const emailMessage = {
      subject: followUpSubject,
      importance: importance,
      body: {
        contentType: 'HTML',
        content: followUpBody
      },
      toRecipients: [{
        emailAddress: {
          address: recipientEmail
        }
      }]
    };

    // Envoyer l'email via Microsoft Graph
    const sendResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${mailbox.email_address}/sendMail`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${response.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: emailMessage })
      }
    );

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      throw new Error(`Erreur lors de l'envoi: ${errorText}`);
    }

    // Logger l'activité de relance
    await supabase
      .from('user_activity_logs')
      .insert({
        user_id: adminCheck,
        activity_type: 'email_followup_sent',
        activity_description: `Relance envoyée pour: ${originalSubject}`,
        resource_id: params.id,
        resource_type: 'mailbox',
        metadata: {
          original_message_id: originalMessageId,
          recipient_email: recipientEmail,
          days_since_original: daysSince,
          follow_up_subject: followUpSubject
        }
      });

    return NextResponse.json({
      success: true,
      data: {
        messageId: originalMessageId,
        followUpSubject,
        recipient: recipientEmail,
        sentAt: new Date().toISOString(),
        daysSinceOriginal: daysSince
      },
      message: `Relance envoyée avec succès à ${recipientEmail}`
    });

  } catch (error) {
    console.error('Error sending follow-up email:', error);
    return NextResponse.json(
      { error: 'SEND_ERROR', message: 'Erreur lors de l\'envoi de la relance' },
      { status: 500 }
    );
  }
}