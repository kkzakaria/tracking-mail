'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart3,
  RefreshCw,
  Download,
  Calendar,
  Filter,
  Users,
  Mail,
  Eye,
  MousePointer,
  Reply
} from 'lucide-react';

interface AnalyticsFilters {
  period: 'day' | 'week' | 'month' | 'year';
  recipientFilter?: string;
  includeDeviceStats: boolean;
  includeTimeAnalysis: boolean;
}

interface AnalyticsData {
  period: string;
  start_date: string;
  end_date: string;
  metrics: {
    emails_sent: number;
    emails_delivered: number;
    emails_opened: number;
    emails_clicked: number;
    emails_replied: number;
    emails_bounced: number;
    open_rate: number;
    click_rate: number;
    reply_rate: number;
    bounce_rate: number;
    top_recipients: Array<{
      email: string;
      sent_count: number;
      open_count: number;
      click_count: number;
      reply_count: number;
    }>;
    activity_by_hour?: Array<{
      hour: number;
      opens: number;
      clicks: number;
    }>;
    device_stats?: Array<{
      device_type: string;
      count: number;
      percentage: number;
    }>;
  };
}

export function AnalyticsPanel() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AnalyticsFilters>({
    period: 'month',
    recipientFilter: '',
    includeDeviceStats: false,
    includeTimeAnalysis: false
  });

  // Fonction pour récupérer les analytics
  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        period: filters.period,
        include_device_stats: filters.includeDeviceStats.toString(),
        include_time_analysis: filters.includeTimeAnalysis.toString()
      });

      if (filters.recipientFilter) {
        params.append('recipient_filter', filters.recipientFilter);
      }

      const response = await fetch(`/api/mail/tracking/analytics?${params}`);

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentification requise - Connectez-vous pour voir les analytics');
        }
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        setData(result.data);
      } else {
        throw new Error(result.error?.message || 'Données invalides');
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  // Charger les données au montage et quand les filtres changent
  useEffect(() => {
    fetchAnalytics();
  }, [filters]);

  // Fonction pour formater les pourcentages
  const formatPercentage = (value: number): string => {
    return `${(value * 100).toFixed(1)}%`;
  };

  // Fonction pour formater les dates
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  // Fonction pour exporter les données
  const exportData = () => {
    if (!data) return;

    const exportData = {
      periode: `${formatDate(data.start_date)} - ${formatDate(data.end_date)}`,
      metriques: data.metrics,
      genere_le: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${data.period}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Filtres */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtres Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Période */}
            <div className="space-y-2">
              <Label>Période</Label>
              <Select
                value={filters.period}
                onValueChange={(value: 'day' | 'week' | 'month' | 'year') =>
                  setFilters(prev => ({ ...prev, period: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Aujourd'hui</SelectItem>
                  <SelectItem value="week">Cette semaine</SelectItem>
                  <SelectItem value="month">Ce mois</SelectItem>
                  <SelectItem value="year">Cette année</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtre destinataire */}
            <div className="space-y-2">
              <Label>Filtre destinataire</Label>
              <Input
                placeholder="@exemple.com"
                value={filters.recipientFilter}
                onChange={(e) =>
                  setFilters(prev => ({ ...prev, recipientFilter: e.target.value }))
                }
              />
            </div>

            {/* Options avancées */}
            <div className="space-y-3">
              <Label>Options avancées</Label>
              <div className="flex items-center space-x-2">
                <Switch
                  id="device-stats"
                  checked={filters.includeDeviceStats}
                  onCheckedChange={(checked) =>
                    setFilters(prev => ({ ...prev, includeDeviceStats: checked }))
                  }
                />
                <Label htmlFor="device-stats" className="text-sm">
                  Stats par device
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="time-analysis"
                  checked={filters.includeTimeAnalysis}
                  onCheckedChange={(checked) =>
                    setFilters(prev => ({ ...prev, includeTimeAnalysis: checked }))
                  }
                />
                <Label htmlFor="time-analysis" className="text-sm">
                  Analyse horaire
                </Label>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <Label>Actions</Label>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={fetchAnalytics}
                  disabled={loading}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Actualiser
                </Button>
                <Button
                  onClick={exportData}
                  disabled={!data || loading}
                  variant="outline"
                  size="sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Exporter
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Erreur */}
      {error && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertDescription className="text-yellow-800">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-4 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Données */}
      {data && !loading && (
        <div className="space-y-6">
          {/* Métriques principales */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Envoyés</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.metrics.emails_sent}</div>
                <p className="text-xs text-muted-foreground">
                  {formatDate(data.start_date)} - {formatDate(data.end_date)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ouverts</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.metrics.emails_opened}</div>
                <Badge variant="secondary">
                  {formatPercentage(data.metrics.open_rate)}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Clics</CardTitle>
                <MousePointer className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.metrics.emails_clicked}</div>
                <Badge variant="secondary">
                  {formatPercentage(data.metrics.click_rate)}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Réponses</CardTitle>
                <Reply className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.metrics.emails_replied}</div>
                <Badge variant="secondary">
                  {formatPercentage(data.metrics.reply_rate)}
                </Badge>
              </CardContent>
            </Card>
          </div>

          {/* Top destinataires */}
          {data.metrics.top_recipients && data.metrics.top_recipients.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Top Destinataires
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Envoyés</TableHead>
                      <TableHead>Ouverts</TableHead>
                      <TableHead>Clics</TableHead>
                      <TableHead>Réponses</TableHead>
                      <TableHead>Taux d'ouverture</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.metrics.top_recipients.map((recipient, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-sm">
                          {recipient.email}
                        </TableCell>
                        <TableCell>{recipient.sent_count}</TableCell>
                        <TableCell>{recipient.open_count}</TableCell>
                        <TableCell>{recipient.click_count}</TableCell>
                        <TableCell>{recipient.reply_count}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {recipient.sent_count > 0
                              ? formatPercentage(recipient.open_count / recipient.sent_count)
                              : '0%'
                            }
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Analyse horaire */}
          {data.metrics.activity_by_hour && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Activité par Heure
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-4">
                  Répartition des ouvertures et clics par heure de la journée
                </div>
                <div className="space-y-2">
                  {data.metrics.activity_by_hour.map((activity) => (
                    <div key={activity.hour} className="flex items-center gap-4">
                      <div className="w-12 text-sm font-mono">
                        {activity.hour.toString().padStart(2, '0')}h
                      </div>
                      <div className="flex-1 flex gap-2">
                        <div className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          <span className="text-sm">{activity.opens}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MousePointer className="w-3 h-3" />
                          <span className="text-sm">{activity.clicks}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats par device */}
          {data.metrics.device_stats && (
            <Card>
              <CardHeader>
                <CardTitle>Statistiques par Device</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type de Device</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Pourcentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.metrics.device_stats.map((device, index) => (
                      <TableRow key={index}>
                        <TableCell>{device.device_type}</TableCell>
                        <TableCell>{device.count}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {device.percentage.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* État vide */}
      {!data && !loading && !error && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Aucune donnée disponible</h3>
            <p className="text-muted-foreground">
              Envoyez des emails trackés pour commencer à voir les analytics
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}