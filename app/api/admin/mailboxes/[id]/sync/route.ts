/**
 * API Route pour synchroniser une boîte email spécifique
 * POST /api/admin/mailboxes/[id]/sync - Synchroniser une boîte email
 */

import { NextRequest, NextResponse } from 'next/server';
// Direct Microsoft Graph implementation - no AdminGraphService dependency
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
 * POST /api/admin/mailboxes/[id]/sync
 * Synchroniser une boîte email avec Microsoft Graph
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await verifyAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    const supabase = await createSupabaseServerClient();

    // Obtenir les détails de la boîte email
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

    if (!mailbox.sync_enabled) {
      return NextResponse.json(
        { error: 'SYNC_DISABLED', message: 'La synchronisation est désactivée pour cette boîte' },
        { status: 400 }
      );
    }

    // Marquer comme en cours de synchronisation
    await supabase
      .from('mailboxes')
      .update({
        sync_status: 'syncing',
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id);

    // Synchronisation directe avec Microsoft Graph
    try {
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
        throw new Error('Impossible d\'obtenir un token d\'accès Microsoft Graph');
      }

      // Récupérer les messages de la boîte email
      const messagesResponse = await fetch(
        `https://graph.microsoft.com/v1.0/users/${mailbox.email_address}/messages?$select=id,subject,from,receivedDateTime,bodyPreview,isRead,importance&$top=50&$orderby=receivedDateTime desc`,
        {
          headers: {
            'Authorization': `Bearer ${response.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!messagesResponse.ok) {
        const errorText = await messagesResponse.text();
        throw new Error(`Erreur Microsoft Graph API: ${errorText}`);
      }

      const messagesData = await messagesResponse.json();
      const messages = messagesData.value || [];

      // Mettre à jour le statut de synchronisation réussie
      await supabase
        .from('mailboxes')
        .update({
          last_sync_at: new Date().toISOString(),
          sync_status: 'completed',
          sync_error: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', params.id);

      return NextResponse.json({
        success: true,
        data: {
          messageCount: messages.length,
          recentMessages: messages.slice(0, 10), // Premiers 10 messages pour l'aperçu
          syncedAt: new Date().toISOString(),
          emailAddress: mailbox.email_address
        },
        message: `Synchronisation réussie : ${messages.length} messages trouvés`
      });

    } catch (graphError) {
      console.error('Microsoft Graph sync error:', graphError);

      // Mettre à jour le statut d'erreur
      await supabase
        .from('mailboxes')
        .update({
          last_sync_at: new Date().toISOString(),
          sync_status: 'error',
          sync_error: graphError instanceof Error ? graphError.message : 'Erreur Microsoft Graph',
          updated_at: new Date().toISOString()
        })
        .eq('id', params.id);

      return NextResponse.json(
        {
          error: 'GRAPH_SYNC_ERROR',
          message: 'Erreur lors de la synchronisation avec Microsoft Graph'
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error syncing mailbox:', error);

    // Marquer comme erreur en cas d'exception
    try {
      const supabase = await createSupabaseServerClient();
      await supabase
        .from('mailboxes')
        .update({
          sync_status: 'error',
          sync_error: error instanceof Error ? error.message : 'Erreur inconnue',
          updated_at: new Date().toISOString()
        })
        .eq('id', params.id);
    } catch (updateError) {
      console.error('Error updating sync status:', updateError);
    }

    return NextResponse.json(
      { error: 'SYNC_ERROR', message: 'Erreur lors de la synchronisation de la boîte email' },
      { status: 500 }
    );
  }
}