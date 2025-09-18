'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSupabaseAuth, useUserMailboxes } from '@/lib/hooks/use-user-mailboxes';
import { useMailboxSync } from '@/lib/hooks/use-mailbox-sync';
import { MessageStatusTable } from '@/components/ui/message-status-table';
import { SevenDayStats } from '@/components/ui/seven-day-stats';
import {
  Mail,
  Inbox,
  RefreshCw,
  User,
  LogOut,
  Clock,
  AlertCircle,
  CheckCircle2,
  MoreHorizontal,
  Eye,
  Settings,
  Grid3X3,
  List,
} from 'lucide-react';

export default function UserDashboard() {
  const { user, signOut, isAuthenticated, loading: authLoading } = useSupabaseAuth();
  const { mailboxes, loading: mailboxLoading, error, refreshMailboxes, getMailboxStats } = useUserMailboxes();
  const { syncMailbox, getEmailsWithoutReply } = useMailboxSync();
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [statsData, setStatsData] = useState<{
    mailboxes: Array<{
      id: string;
      mailboxes: {
        id: string;
        email_address: string;
        display_name: string | null;
        sync_status: string;
        sync_enabled: boolean;
        last_sync_at: string | null;
        sync_error: string | null;
      };
      permission_level: string;
      stats?: {
        totalMessages: number;
        unreadMessages: number;
        folders: Array<{
          id: string;
          displayName: string;
          childFolderCount: number;
          unreadItemCount: number;
          totalItemCount: number;
        }>;
      };
      statsError?: string | null;
    }>;
    totalStats: {
      totalMessages: number;
      unreadMessages: number;
      mailboxCount: number;
    };
    user: {
      id: string;
      email: string;
      displayName: string;
    };
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const router = useRouter();


  // Redirect if not authenticated (only after loading is complete)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Load mailbox data on mount - use optimized stats API for better performance
  useEffect(() => {
    if (isAuthenticated && user) {
      loadMailboxData();
    }
  }, [isAuthenticated, user]);

  const loadMailboxData = async () => {
    setStatsLoading(true);
    setStatsError(null);

    try {
      // Load basic mailbox info first (without messages)
      await refreshMailboxes({ includeMessages: false });

      // Then load optimized stats
      const statsResult = await getMailboxStats({ quickStats: true });

      if (statsResult.success && statsResult.data) {
        setStatsData(statsResult.data);
      } else {
        setStatsError(statsResult.error || 'Erreur lors du chargement des statistiques');
      }
    } catch (error) {
      setStatsError(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setStatsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMailboxData();
    setRefreshing(false);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/login');
  };

  const handleSyncMailbox = async (mailboxId: string) => {
    const result = await syncMailbox(mailboxId);
    if (result.success) {
      // Rafraîchir les données après synchronisation
      await loadMailboxData();
    }
  };

  const handleViewMessages = (mailboxId: string) => {
    router.push(`/mailbox/${mailboxId}`);
  };

  const handleViewWithoutReply = (mailboxId: string) => {
    router.push(`/mailbox/${mailboxId}/without-reply`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'syncing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-3 w-3" />;
      case 'syncing':
        return <RefreshCw className="h-3 w-3 animate-spin" />;
      case 'error':
        return <AlertCircle className="h-3 w-3" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  const getPermissionBadge = (level: string) => {
    const colors = {
      read: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      read_write: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    };
    return colors[level as keyof typeof colors] || colors.read;
  };

  // Merge mailbox data with stats data
  const getEnrichedMailboxes = () => {
    if (!statsData?.mailboxes) {
      return mailboxes;
    }

    return mailboxes.map(mailbox => {
      const statsMailbox = statsData.mailboxes.find(sm =>
        sm.mailboxes.id === mailbox.mailboxes.id
      );

      return {
        ...mailbox,
        stats: statsMailbox?.stats,
        statsError: statsMailbox?.statsError
      };
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-slate-600" />
          <p className="text-slate-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-slate-600" />
          <p className="text-slate-600">Redirection...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Mail className="h-8 w-8 text-blue-600" />
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                Tracking Mail
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              {/* View Mode Toggle */}
              <div className="hidden md:flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                <Button
                  variant={viewMode === 'cards' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('cards')}
                  className="h-8 px-2"
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                  className="h-8 px-2"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="hidden sm:flex"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Actualiser
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-blue-600 text-white">
                        {user?.email?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {user?.user_metadata?.display_name || user?.email}
                      </p>
                      <p className="text-xs leading-none text-slate-600">
                        {user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <User className="mr-2 h-4 w-4" />
                    <span>Profil</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Paramètres</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Se déconnecter</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Bonjour, {user?.user_metadata?.display_name || user?.email?.split('@')[0]} 👋
          </h2>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Voici vos boîtes emails assignées et leurs derniers messages.
          </p>
        </div>

        {/* Statistiques des 7 derniers jours - NOUVELLE API */}
        <SevenDayStats className="mb-8" />

        {/* Stats Error State */}
        {statsError && (
          <Card className="mb-6 border-orange-200 dark:border-orange-800">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2 text-orange-600 dark:text-orange-400">
                <AlertCircle className="h-5 w-5" />
                <p className="font-medium">Erreur lors du chargement des statistiques</p>
              </div>
              <p className="mt-2 text-sm text-orange-600 dark:text-orange-400">{statsError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="mt-4"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Réessayer
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="mb-6 border-red-200 dark:border-red-800">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
                <AlertCircle className="h-5 w-5" />
                <p className="font-medium">Erreur lors du chargement</p>
              </div>
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="mt-4"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Réessayer
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {(mailboxLoading || statsLoading) && mailboxes.length === 0 && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="pt-6">
                  <div className="h-4 bg-slate-200 rounded w-1/4 mb-4"></div>
                  <div className="space-y-2">
                    <div className="h-3 bg-slate-200 rounded w-3/4"></div>
                    <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Mailboxes Display */}
        {mailboxes.length > 0 && (
          <div className="space-y-6">
            {/* Table View */}
            {viewMode === 'table' && (
              <MessageStatusTable
                mailboxes={getEnrichedMailboxes()}
                onSyncMailbox={handleSyncMailbox}
                onViewMessages={handleViewMessages}
                onViewWithoutReply={handleViewWithoutReply}
                loading={mailboxLoading || statsLoading}
              />
            )}

            {/* Cards View */}
            {viewMode === 'cards' && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {getEnrichedMailboxes().map((assignment) => {
                  const mailbox = assignment.mailboxes;
                  return (
                    <Card key={assignment.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                              <Inbox className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <CardTitle className="text-lg font-semibold truncate">
                                {mailbox.display_name || mailbox.email_address}
                              </CardTitle>
                              <p className="text-sm text-slate-500 truncate">
                                {mailbox.email_address}
                              </p>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/mailbox/${mailbox.id}`)}>
                                <Eye className="mr-2 h-4 w-4" />
                                Voir les messages
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        {/* Status and Permission */}
                        <div className="flex items-center justify-between">
                          <Badge className={`${getStatusColor(mailbox.sync_status)} flex items-center space-x-1`}>
                            {getStatusIcon(mailbox.sync_status)}
                            <span className="text-xs font-medium">
                              {mailbox.sync_status === 'completed' && 'Synchronisé'}
                              {mailbox.sync_status === 'syncing' && 'En cours'}
                              {mailbox.sync_status === 'error' && 'Erreur'}
                              {mailbox.sync_status === 'pending' && 'En attente'}
                            </span>
                          </Badge>
                          <Badge className={getPermissionBadge(assignment.permission_level)}>
                            {assignment.permission_level === 'read' && 'Lecture'}
                            {assignment.permission_level === 'read_write' && 'Lecture/Écriture'}
                            {assignment.permission_level === 'admin' && 'Administration'}
                          </Badge>
                        </div>

                        <Separator />

                        {/* Messages Preview */}
                        {assignment.messages && assignment.messages.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              Messages récents ({assignment.messages.length})
                            </p>
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                              {assignment.messages.slice(0, 3).map((message, index) => (
                                <div
                                  key={message.id || index}
                                  className="p-2 bg-slate-50 dark:bg-slate-800 rounded-md text-xs"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                                      {message.subject || 'Sans objet'}
                                    </span>
                                    {!message.isRead && (
                                      <div className="h-2 w-2 bg-blue-600 rounded-full"></div>
                                    )}
                                  </div>
                                  <p className="text-slate-600 dark:text-slate-400 truncate">
                                    {message.from?.emailAddress?.name || 'Expéditeur inconnu'}
                                  </p>
                                </div>
                              ))}
                            </div>
                            {assignment.messages.length > 3 && (
                              <p className="text-xs text-slate-500 text-center">
                                +{assignment.messages.length - 3} autres messages
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <Inbox className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                            <p className="text-sm text-slate-500">Aucun message récent</p>
                          </div>
                        )}

                        {/* Action Button */}
                        <Button
                          className="w-full"
                          onClick={() => router.push(`/mailbox/${mailbox.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Voir tous les messages
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!mailboxLoading && mailboxes.length === 0 && !error && (
          <Card className="text-center py-12">
            <CardContent>
              <Inbox className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
                Aucune boîte email assignée
              </h3>
              <p className="text-slate-500 dark:text-slate-400 mb-4">
                Contactez votre administrateur pour obtenir l&apos;accès à des boîtes emails.
              </p>
              <Button onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualiser
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}