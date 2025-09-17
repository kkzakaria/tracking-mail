/**
 * API Route pour détecter les emails envoyés sans réponse
 * GET /api/admin/mailboxes/[id]/sent-without-reply - Obtenir les emails envoyés sans réponse
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
 * Analyser les conversations pour détecter les emails sans réponse
 */
async function analyzeEmailConversations(messages: any[], daysWithoutReply: number = 3) {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - (daysWithoutReply * 24 * 60 * 60 * 1000));

  // Grouper par conversation
  const conversations = new Map();

  messages.forEach(message => {
    const conversationId = message.conversationId || message.id;
    if (!conversations.has(conversationId)) {
      conversations.set(conversationId, []);
    }
    conversations.get(conversationId).push(message);
  });

  const emailsWithoutReply = [];

  conversations.forEach((conversationMessages, conversationId) => {
    // Trier par date (plus récent en premier)
    conversationMessages.sort((a: any, b: any) =>
      new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime()
    );

    // Trouver le dernier email envoyé
    const lastSentMessage = conversationMessages.find((msg: any) => {
      // Vérifier si c'est un email envoyé (depuis notre boîte)
      return msg.sender?.emailAddress?.address === msg.from?.emailAddress?.address;
    });

    if (lastSentMessage) {
      const sentDate = new Date(lastSentMessage.receivedDateTime);

      // Vérifier s'il y a eu des réponses après cet email
      const repliesAfterSent = conversationMessages.filter((msg: any) => {
        const msgDate = new Date(msg.receivedDateTime);
        return msgDate > sentDate && msg.id !== lastSentMessage.id;
      });

      // Si pas de réponse et l'email a été envoyé avant la date limite
      if (repliesAfterSent.length === 0 && sentDate < cutoffDate) {
        emailsWithoutReply.push({
          ...lastSentMessage,
          daysSinceLastSent: Math.floor((now.getTime() - sentDate.getTime()) / (24 * 60 * 60 * 1000)),
          conversationId,
          needsFollowUp: true
        });
      }
    }
  });

  return emailsWithoutReply.sort((a, b) => b.daysSinceLastSent - a.daysSinceLastSent);
}

/**
 * GET /api/admin/mailboxes/[id]/sent-without-reply
 * Obtenir les emails envoyés sans réponse pour relances automatiques
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await verifyAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    const { searchParams } = new URL(request.url);
    const daysWithoutReply = parseInt(searchParams.get('days') || '3');
    const limit = parseInt(searchParams.get('limit') || '50');

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

    // Récupérer les emails via Microsoft Graph
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

    // Récupérer les emails envoyés et reçus des derniers 30 jours
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const graphUrl = `https://graph.microsoft.com/v1.0/users/${mailbox.email_address}/messages`;
    const params = new URLSearchParams({
      '$select': 'id,subject,from,receivedDateTime,bodyPreview,conversationId,sender,toRecipients',
      '$top': Math.min(limit * 2, 200).toString(), // Plus d'emails pour analyser les conversations
      '$orderby': 'receivedDateTime desc',
      '$filter': `receivedDateTime ge ${thirtyDaysAgo.toISOString()}`
    });

    const messagesResponse = await fetch(`${graphUrl}?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${response.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!messagesResponse.ok) {
      const errorText = await messagesResponse.text();
      throw new Error(`Microsoft Graph API error: ${errorText}`);
    }

    const messagesData = await messagesResponse.json();
    const allMessages = messagesData.value || [];

    // Analyser les conversations pour détecter les emails sans réponse
    const emailsWithoutReply = await analyzeEmailConversations(allMessages, daysWithoutReply);

    return NextResponse.json({
      success: true,
      data: {
        emailsWithoutReply: emailsWithoutReply.slice(0, limit),
        totalAnalyzed: allMessages.length,
        mailbox: {
          id: mailbox.id,
          emailAddress: mailbox.email_address,
          displayName: mailbox.display_name
        },
        criteria: {
          daysWithoutReply,
          analyzedPeriod: '30 jours',
          cutoffDate: new Date(Date.now() - (daysWithoutReply * 24 * 60 * 60 * 1000)).toISOString()
        }
      },
      message: `${emailsWithoutReply.length} emails trouvés nécessitant une relance`
    });

  } catch (error) {
    console.error('Error analyzing emails without reply:', error);
    return NextResponse.json(
      { error: 'ANALYSIS_ERROR', message: 'Erreur lors de l\'analyse des emails sans réponse' },
      { status: 500 }
    );
  }
}