/**
 * Composant pour afficher les statistiques des 7 derniers jours
 * Affiche un aperçu global et les détails par boîte email
 */

'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSevenDayStats } from '@/lib/hooks/use-seven-day-stats';
import {
  Mail,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertCircle,
  MailOpen,
  MessageSquare,
  Clock,
  CheckCircle2,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SevenDayStatsProps {
  className?: string;
}

/**
 * Composant pour afficher les métriques globales
 */
function OverviewCards({ overview, loading }: { overview: any; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-slate-200 rounded mb-2"></div>
              <div className="h-8 bg-slate-200 rounded mb-1"></div>
              <div className="h-3 bg-slate-200 rounded w-20"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!overview) return null;

  const cards = [
    {
      title: 'Messages totaux',
      value: overview.totalMessages.toLocaleString(),
      description: '7 derniers jours',
      icon: Mail,
      color: 'text-blue-600'
    },
    {
      title: 'Messages non lus',
      value: overview.totalUnread.toLocaleString(),
      description: `${overview.totalMessages > 0 ? Math.round((overview.totalUnread / overview.totalMessages) * 100) : 0}% du total`,
      icon: MailOpen,
      color: 'text-yellow-600'
    },
    {
      title: 'Sans réponse',
      value: overview.totalUnanswered.toLocaleString(),
      description: `Taux de réponse: ${overview.averageResponseRate}%`,
      icon: MessageSquare,
      color: 'text-red-600'
    },
    {
      title: 'Boîtes actives',
      value: overview.activeMailboxes.toString(),
      description: `Taux de lecture: ${overview.averageReadRate}%`,
      icon: CheckCircle2,
      color: 'text-green-600'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, index) => (
        <Card key={index}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  {card.title}
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {card.value}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {card.description}
                </p>
              </div>
              <div className={cn('p-2 rounded-full bg-slate-100 dark:bg-slate-800', card.color)}>
                <card.icon className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Composant pour afficher l'indicateur de tendance
 */
function TrendIndicator({ value, label }: { value: number; label: string }) {
  const isPositive = value > 0;
  const isNeutral = value === 0;

  return (
    <div className="flex items-center space-x-1">
      {isNeutral ? (
        <Minus className="h-3 w-3 text-slate-400" />
      ) : isPositive ? (
        <TrendingUp className="h-3 w-3 text-green-600" />
      ) : (
        <TrendingDown className="h-3 w-3 text-red-600" />
      )}
      <span className={cn(
        'text-xs font-medium',
        isNeutral ? 'text-slate-400' : isPositive ? 'text-green-600' : 'text-red-600'
      )}>
        {isNeutral ? '0%' : `${Math.abs(value)}%`}
      </span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

/**
 * Composant pour afficher les détails d'une boîte email
 */
function MailboxStatCard({ stat }: { stat: any }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {stat.displayName || stat.emailAddress}
            </CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {stat.emailAddress}
            </p>
          </div>
          {stat.error && (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {stat.error ? (
          <div className="text-sm text-red-600 dark:text-red-400">
            {stat.error}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Statistiques principales */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {stat.stats.totalMessages}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Messages</p>
                <TrendIndicator value={stat.trend.messagesChange} label="vs 7j précédents" />
              </div>
              <div>
                <p className="text-lg font-semibold text-yellow-600">
                  {stat.stats.unreadMessages}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Non lus</p>
                <TrendIndicator value={stat.trend.unreadChange} label="vs 7j précédents" />
              </div>
            </div>

            {/* Métriques avancées */}
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-slate-700">
              <div>
                <p className="text-sm font-medium text-red-600">
                  {stat.stats.unansweredMessages}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Sans réponse</p>
              </div>
              <div>
                <p className="text-sm font-medium text-green-600">
                  {stat.stats.responseRate}%
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Taux réponse</p>
                <TrendIndicator value={stat.trend.responseRateChange} label="vs 7j précédents" />
              </div>
            </div>

            {/* Badges de statut */}
            <div className="flex flex-wrap gap-1 pt-2">
              <Badge variant="outline" className="text-xs">
                <MailOpen className="h-3 w-3 mr-1" />
                {stat.stats.readRate}% lus
              </Badge>
              {stat.stats.responseRate >= 90 && (
                <Badge variant="outline" className="text-xs text-green-700 border-green-300">
                  Excellent taux de réponse
                </Badge>
              )}
              {stat.stats.unreadMessages > 50 && (
                <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-300">
                  Beaucoup de non lus
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Composant principal pour les statistiques des 7 derniers jours
 */
export function SevenDayStats({ className }: SevenDayStatsProps) {
  const { stats, overview, loading, error, refreshStats, lastUpdated } = useSevenDayStats();

  const handleRefresh = async () => {
    await refreshStats();
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* En-tête avec bouton de rafraîchissement */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center">
            <BarChart3 className="h-5 w-5 mr-2 text-blue-600" />
            Statistiques des 7 derniers jours
          </h2>
          {lastUpdated && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Dernière mise à jour: {lastUpdated.toLocaleString('fr-FR')}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center space-x-2"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          <span>Actualiser</span>
        </Button>
      </div>

      {/* Message d'erreur global */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Erreur lors du chargement</span>
            </div>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Cartes de vue d'ensemble */}
      <OverviewCards overview={overview} loading={loading} />

      {/* Détails par boîte email */}
      {!loading && stats.length > 0 && (
        <div>
          <h3 className="text-md font-medium text-slate-900 dark:text-slate-100 mb-4">
            Détails par boîte email
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.map((stat) => (
              <MailboxStatCard key={stat.mailboxId} stat={stat} />
            ))}
          </div>
        </div>
      )}

      {/* Message si aucune boîte email */}
      {!loading && !error && stats.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Mail className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">
              Aucune boîte email assignée
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
              Contactez votre administrateur pour obtenir l'accès aux boîtes email.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Message d'information sur l'accès admin */}
      {stats.some(stat => stat.error?.includes('non autorisé')) && (
        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 text-yellow-700 dark:text-yellow-300">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">Accès limité</span>
            </div>
            <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
              Certaines statistiques nécessitent des privilèges administrateur.
              Les données affichées peuvent être limitées.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}