import { NextRequest, NextResponse } from 'next/server';
import { GraphMailboxService, GraphStatsService } from '@/lib/services/graph';
import { createClient } from '@/lib/utils/supabase/server';

/**
 * GET /api/admin/mailboxes/[id]/stats
 * Obtenir les statistiques d'une boîte email pour une période donnée
 *
 * Query params:
 * - startDate: Date de début (ISO string, ex: 2024-01-01T00:00:00.000Z)
 * - endDate: Date de fin (ISO string, ex: 2024-12-31T23:59:59.999Z)
 * - includeFolders: Inclure les détails par dossier (boolean, défaut: false)
 * - includeUnanswered: Calculer les messages sans réponse (boolean, défaut: true)
 * - includeUnansweredSample: Inclure un échantillon de messages sans réponse (boolean, défaut: false)
 * - onlyUserFolders: Exclure les dossiers système (boolean, défaut: true)
 * - quick: Mode rapide sans messages sans réponse (boolean, défaut: false)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log('[Stats API] Requête reçue pour mailbox ID:', id);
    console.log('[Stats API] URL complète:', request.url);

    const supabase = await createClient();

    // Vérifier l'authentification
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    console.log('[Stats API] Authentification:', {
      userId: user?.id,
      email: user?.email,
      hasError: !!authError,
      errorMessage: authError?.message
    });

    if (authError || !user) {
      console.error('[Stats API] Utilisateur non authentifié');
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // Vérifier le rôle admin
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Accès refusé. Rôle administrateur requis.' },
        { status: 403 }
      );
    }

    // Récupérer la boîte email
    console.log('[Stats API] Recherche de la boîte email avec ID:', id);
    const { data: mailbox, error: mailboxError } = await supabase
      .from('mailboxes')
      .select('*')
      .eq('id', id)
      .single();

    console.log('[Stats API] Résultat boîte email:', {
      found: !!mailbox,
      error: mailboxError?.message,
      emailAddress: mailbox?.email_address
    });

    if (mailboxError || !mailbox) {
      console.error('[Stats API] Boîte email non trouvée:', mailboxError);
      return NextResponse.json(
        { error: 'Boîte email non trouvée' },
        { status: 404 }
      );
    }

    // Récupérer les paramètres de la requête
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const includeFolders = searchParams.get('includeFolders') === 'true';
    const includeUnanswered = searchParams.get('includeUnanswered') !== 'false';
    const includeUnansweredSample = searchParams.get('includeUnansweredSample') === 'true';
    const onlyUserFolders = searchParams.get('onlyUserFolders') !== 'false';
    const quick = searchParams.get('quick') === 'true';

    console.log('[Stats API] Paramètres analysés:', {
      quick,
      quickParam: searchParams.get('quick'),
      startDate,
      endDate,
      includeUnanswered
    });

    // Valider les dates si fournies
    if (startDate && !isValidDate(startDate)) {
      return NextResponse.json(
        { error: 'Date de début invalide. Format attendu: ISO 8601 (ex: 2024-01-01T00:00:00.000Z)' },
        { status: 400 }
      );
    }

    if (endDate && !isValidDate(endDate)) {
      return NextResponse.json(
        { error: 'Date de fin invalide. Format attendu: ISO 8601 (ex: 2024-12-31T23:59:59.999Z)' },
        { status: 400 }
      );
    }

    // Vérifier que la date de début est antérieure à la date de fin
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      return NextResponse.json(
        { error: 'La date de début doit être antérieure à la date de fin' },
        { status: 400 }
      );
    }

    // Initialiser les services modernes
    console.log('[Stats API] Initialisation des services Graph...');
    const mailboxService = GraphMailboxService.getInstance();
    const quickStatsService = GraphStatsService.getInstance();

    // Mode rapide : statistiques de base avec estimations intelligentes
    if (quick) {
      console.log('[Stats API] MODE RAPIDE ACTIVÉ - Utilisation du GraphStatsService');
      const quickResult = await quickStatsService.getQuickStats(mailbox.email_address, {
        useEstimates: false,    // Essayer les données réelles d'abord
        fallbackToDefaults: true // Utiliser les estimations par défaut si nécessaire
      });

      if (!quickResult.success) {
        return NextResponse.json(
          {
            error: quickResult.error?.message || 'Erreur lors de la récupération des statistiques rapides',
            details: quickResult.error?.details
          },
          { status: 500 }
        );
      }

      const response = {
        ...quickResult.data,
        emailAddress: mailbox.email_address,
        mailboxId: mailbox.id,
        mailboxName: mailbox.display_name,
        mode: 'quick',
        generatedAt: new Date().toISOString()
      };

      return NextResponse.json(response);
    }

    // Mode complet : récupérer les statistiques avancées avec détection des messages sans réponse
    const statsResult = await mailboxService.getMailboxPeriodStats(
      mailbox.email_address,
      {
        startDate,
        endDate,
        includeFolders,
        includeUnanswered,
        includeUnansweredSample,
        onlyUserFolders
      }
    );

    if (!statsResult.success || !statsResult.data) {
      return NextResponse.json(
        {
          error: statsResult.error?.message || 'Erreur lors de la récupération des statistiques',
          details: statsResult.error?.details
        },
        { status: 500 }
      );
    }

    // La nouvelle API retourne déjà toutes les métadonnées enrichies
    const response = {
      ...statsResult.data,
      mailboxId: mailbox.id,
      // mailboxName et autres métadonnées sont déjà incluses par getMailboxPeriodStats
      mode: 'complete'
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in mailbox stats API:', error);
    return NextResponse.json(
      {
        error: 'Erreur interne du serveur',
        details: error instanceof Error ? error.message : 'Erreur inconnue'
      },
      { status: 500 }
    );
  }
}

/**
 * Valider le format d'une date ISO
 */
function isValidDate(dateString: string): boolean {
  try {
    const date = new Date(dateString);
    return date.toISOString() === dateString;
  } catch {
    return false;
  }
}

/**
 * Calculer le nombre de jours dans la période
 */
function calculatePeriodDays(startDate?: string, endDate?: string): number | null {
  if (!startDate || !endDate) {
    return null;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}