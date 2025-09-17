'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Mail,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
  MoreHorizontal,
  Eye,
  Send,
  AlertTriangle,
} from 'lucide-react';

interface Message {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name?: string;
      address: string;
    };
  };
  receivedDateTime: string;
  bodyPreview: string;
  isRead: boolean;
  importance: string;
  conversationId?: string;
}

interface MailboxStats {
  totalMessages: number;
  unreadMessages: number;
  folders: Array<{
    id: string;
    displayName: string;
    childFolderCount: number;
    unreadItemCount: number;
    totalItemCount: number;
  }>;
}

interface MessageStatusTableProps {
  mailboxes: Array<{
    id: string;
    mailboxes: {
      id: string;
      email_address: string;
      display_name?: string;
      sync_status: string;
      last_sync_at?: string;
      sync_error?: string;
    };
    permission_level: string;
    messages?: Message[];
    stats?: MailboxStats;
    statsError?: string | null;
  }>;
  onSyncMailbox: (mailboxId: string) => Promise<void>;
  onViewMessages: (mailboxId: string) => void;
  onViewWithoutReply: (mailboxId: string) => void;
  loading?: boolean;
}

export function MessageStatusTable({
  mailboxes,
  onSyncMailbox,
  onViewMessages,
  onViewWithoutReply,
  loading = false
}: MessageStatusTableProps) {
  const [syncingMailboxes, setSyncingMailboxes] = useState<Set<string>>(new Set());

  const handleSync = async (mailboxId: string) => {
    setSyncingMailboxes(prev => new Set(prev).add(mailboxId));
    try {
      await onSyncMailbox(mailboxId);
    } finally {
      setSyncingMailboxes(prev => {
        const newSet = new Set(prev);
        newSet.delete(mailboxId);
        return newSet;
      });
    }
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

  const getStatusIcon = (status: string, isManualSyncing: boolean = false) => {
    if (isManualSyncing) {
      return <RefreshCw className="h-3 w-3 animate-spin" />;
    }

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

  const getStatusText = (status: string, isManualSyncing: boolean = false) => {
    if (isManualSyncing) return 'Synchronisation...';

    switch (status) {
      case 'completed': return 'Synchronisé';
      case 'syncing': return 'En cours';
      case 'error': return 'Erreur';
      default: return 'En attente';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Jamais';
    return new Date(dateString).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMessagesSummary = (messages?: Message[], stats?: MailboxStats) => {
    // Use optimized stats if available
    if (stats) {
      return {
        total: stats.totalMessages,
        unread: stats.unreadMessages,
        recent: 0 // Recent count not available in stats, would need separate API call with period filter
      };
    }

    // Fallback to message-based counting
    if (!messages || messages.length === 0) {
      return { total: 0, unread: 0, recent: 0 };
    }

    const unread = messages.filter(msg => !msg.isRead).length;
    const recent = messages.filter(msg => {
      const msgDate = new Date(msg.receivedDateTime);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return msgDate > yesterday;
    }).length;

    return {
      total: messages.length,
      unread,
      recent
    };
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Mail className="h-5 w-5" />
            <span>Statut des messages</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Mail className="h-5 w-5" />
            <span>Statut des messages par boîte</span>
          </div>
          <Badge variant="outline" className="ml-2">
            {mailboxes.length} boîte{mailboxes.length > 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {mailboxes.length === 0 ? (
          <div className="text-center py-8">
            <Mail className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-500">Aucune boîte email configurée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Boîte email</TableHead>
                  <TableHead>Statut sync</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Dernière sync</TableHead>
                  <TableHead>Permission</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mailboxes.map((assignment) => {
                  const mailbox = assignment.mailboxes;
                  const isManualSyncing = syncingMailboxes.has(mailbox.id);
                  const messagesSummary = getMessagesSummary(assignment.messages, assignment.stats);

                  return (
                    <TableRow key={assignment.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium text-sm">
                            {mailbox.display_name || mailbox.email_address}
                          </div>
                          <div className="text-xs text-slate-500">
                            {mailbox.email_address}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <Badge
                            className={`${getStatusColor(mailbox.sync_status)} flex items-center space-x-1 w-fit`}
                          >
                            {getStatusIcon(mailbox.sync_status, isManualSyncing)}
                            <span className="text-xs">
                              {getStatusText(mailbox.sync_status, isManualSyncing)}
                            </span>
                          </Badge>
                          {mailbox.sync_error && (
                            <div className="text-xs text-red-600 dark:text-red-400">
                              {mailbox.sync_error}
                            </div>
                          )}
                          {assignment.statsError && (
                            <div className="text-xs text-orange-600 dark:text-orange-400">
                              Stats: {assignment.statsError}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">
                            <span className="font-medium">{messagesSummary.total}</span> total
                          </div>
                          <div className="flex space-x-2 text-xs">
                            {messagesSummary.unread > 0 && (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                {messagesSummary.unread} non lus
                              </Badge>
                            )}
                            {messagesSummary.recent > 0 && (
                              <Badge variant="secondary" className="bg-green-100 text-green-800">
                                {messagesSummary.recent} récents
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="text-sm text-slate-600 dark:text-slate-400">
                          {formatDate(mailbox.last_sync_at)}
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            assignment.permission_level === 'admin'
                              ? 'bg-purple-100 text-purple-800'
                              : assignment.permission_level === 'read_write'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-blue-100 text-blue-800'
                          }
                        >
                          {assignment.permission_level === 'read' && 'Lecture'}
                          {assignment.permission_level === 'read_write' && 'Écriture'}
                          {assignment.permission_level === 'admin' && 'Admin'}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSync(mailbox.id)}
                            disabled={isManualSyncing}
                          >
                            <RefreshCw className={`h-3 w-3 ${isManualSyncing ? 'animate-spin' : ''}`} />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onViewMessages(mailbox.id)}>
                                <Eye className="mr-2 h-4 w-4" />
                                Voir tous les messages
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onViewWithoutReply(mailbox.id)}>
                                <AlertTriangle className="mr-2 h-4 w-4" />
                                Emails sans réponse
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}