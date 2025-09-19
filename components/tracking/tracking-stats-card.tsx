'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Mail,
  Eye,
  MousePointer,
  Reply,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

interface TrackingStats {
  totalEmails: number;
  totalOpens: number;
  totalClicks: number;
  totalReplies: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
}

export function TrackingStatsCard() {
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fonction pour récupérer les statistiques
  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);

      // Appel à l'API analytics
      const response = await fetch('/api/mail/tracking/analytics?period=month');

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentification requise');
        }
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.data?.metrics) {
        const metrics = data.data.metrics;
        setStats({
          totalEmails: metrics.emails_sent || 0,
          totalOpens: metrics.emails_opened || 0,
          totalClicks: metrics.emails_clicked || 0,
          totalReplies: metrics.emails_replied || 0,
          openRate: metrics.open_rate || 0,
          clickRate: metrics.click_rate || 0,
          replyRate: metrics.reply_rate || 0
        });
      } else {
        throw new Error('Format de réponse invalide');
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');

      // En cas d'erreur, utiliser des données simulées pour la démonstration
      setStats({
        totalEmails: 0,
        totalOpens: 0,
        totalClicks: 0,
        totalReplies: 0,
        openRate: 0,
        clickRate: 0,
        replyRate: 0
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Fonction pour formater les pourcentages
  const formatPercentage = (value: number): string => {
    return `${(value * 100).toFixed(1)}%`;
  };

  // Fonction pour obtenir la couleur du badge selon le taux
  const getRateBadgeVariant = (rate: number) => {
    if (rate >= 0.3) return 'default'; // Bon taux (>30%)
    if (rate >= 0.15) return 'secondary'; // Taux moyen (15-30%)
    return 'outline'; // Faible taux (<15%)
  };

  // Fonction pour obtenir l'icône de tendance
  const getTrendIcon = (rate: number) => {
    if (rate >= 0.25) return <TrendingUp className="w-3 h-3 text-green-600" />;
    if (rate >= 0.1) return null;
    return <TrendingDown className="w-3 h-3 text-red-600" />;
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-12 mb-2" />
              <Skeleton className="h-4 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error && !stats) {
    return (
      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-yellow-800">
            <Mail className="w-5 h-5" />
            <div>
              <p className="font-medium">Statistiques non disponibles</p>
              <p className="text-sm text-yellow-700">{error}</p>
              <p className="text-xs text-yellow-600 mt-1">
                Connectez-vous et envoyez des emails trackés pour voir les statistiques
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Emails Envoyés */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Emails Envoyés</CardTitle>
          <Mail className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats?.totalEmails || 0}</div>
          <p className="text-xs text-muted-foreground">
            Ce mois-ci
          </p>
        </CardContent>
      </Card>

      {/* Taux d'Ouverture */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Taux d'Ouverture</CardTitle>
          <Eye className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold">
              {stats ? formatPercentage(stats.openRate) : '0%'}
            </div>
            {stats && getTrendIcon(stats.openRate)}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={stats ? getRateBadgeVariant(stats.openRate) : 'outline'} className="text-xs">
              {stats?.totalOpens || 0} ouvertures
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Taux de Clic */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Taux de Clic</CardTitle>
          <MousePointer className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold">
              {stats ? formatPercentage(stats.clickRate) : '0%'}
            </div>
            {stats && getTrendIcon(stats.clickRate)}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={stats ? getRateBadgeVariant(stats.clickRate) : 'outline'} className="text-xs">
              {stats?.totalClicks || 0} clics
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Taux de Réponse */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Taux de Réponse</CardTitle>
          <Reply className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold">
              {stats ? formatPercentage(stats.replyRate) : '0%'}
            </div>
            {stats && getTrendIcon(stats.replyRate)}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={stats ? getRateBadgeVariant(stats.replyRate) : 'outline'} className="text-xs">
              {stats?.totalReplies || 0} réponses
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}