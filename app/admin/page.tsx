'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSupabaseAuth } from '@/lib/hooks/use-user-mailboxes';
import {
  Users,
  Settings,
  Plus,
  MoreHorizontal,
  User,
  LogOut,
  Shield,
  Database,
  Activity,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Eye,
  Edit,
  Trash2,
  UserPlus,
  Mail as MailIcon,
} from 'lucide-react';

// Types pour les données administrateur
interface AdminStats {
  totalUsers: number;
  totalMailboxes: number;
  totalAssignments: number;
  activeUsers: number;
  syncingMailboxes: number;
  recentActivity: number;
}

interface UserData {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  role: 'user' | 'admin' | 'manager';
  is_active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

interface MailboxData {
  id: string;
  email_address: string;
  display_name: string | null;
  sync_status: 'pending' | 'syncing' | 'completed' | 'error';
  is_active: boolean;
  last_sync_at: string | null;
  assigned_users_count: number;
}

export default function AdminDashboard() {
  const { user, signOut, isAuthenticated } = useSupabaseAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalMailboxes: 0,
    totalAssignments: 0,
    activeUsers: 0,
    syncingMailboxes: 0,
    recentActivity: 0,
  });
  const [users, setUsers] = useState<UserData[]>([]);
  const [mailboxes, setMailboxes] = useState<MailboxData[]>([]);
  const [showNewMailboxDialog, setShowNewMailboxDialog] = useState(false);
  const [newMailbox, setNewMailbox] = useState({ email: '', displayName: '' });
  const router = useRouter();

  // Vérifier si l'utilisateur est admin
  useEffect(() => {
    if (!isAuthenticated && !loading) {
      router.push('/auth/login');
      return;
    }

    if (isAuthenticated && user) {
      // Vérifier le rôle admin - dans un vrai système, cela viendrait de l'API
      const userRole = user.user_metadata?.role || 'user';
      if (userRole === 'admin') {
        setIsAdmin(true);
        loadDashboardData();
      } else {
        router.push('/dashboard'); // Rediriger les non-admins vers le dashboard utilisateur
      }
    }
  }, [isAuthenticated, loading, user, router]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Simuler le chargement des données - dans un vrai système, ces appels seraient vers l'API
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mock data
      setStats({
        totalUsers: 24,
        totalMailboxes: 8,
        totalAssignments: 56,
        activeUsers: 18,
        syncingMailboxes: 2,
        recentActivity: 12,
      });

      setUsers([
        {
          id: '1',
          email: 'john.doe@example.com',
          full_name: 'John Doe',
          display_name: 'John',
          role: 'user',
          is_active: true,
          created_at: '2024-01-15T10:30:00Z',
          last_sign_in_at: '2024-12-17T08:45:00Z',
        },
        {
          id: '2',
          email: 'jane.smith@example.com',
          full_name: 'Jane Smith',
          display_name: 'Jane',
          role: 'manager',
          is_active: true,
          created_at: '2024-02-20T14:15:00Z',
          last_sign_in_at: '2024-12-16T16:20:00Z',
        },
      ]);

      setMailboxes([
        {
          id: '1',
          email_address: 'support@company.com',
          display_name: 'Support Client',
          sync_status: 'completed',
          is_active: true,
          last_sync_at: '2024-12-17T09:15:00Z',
          assigned_users_count: 3,
        },
        {
          id: '2',
          email_address: 'sales@company.com',
          display_name: 'Équipe Vente',
          sync_status: 'syncing',
          is_active: true,
          last_sync_at: '2024-12-17T09:00:00Z',
          assigned_users_count: 5,
        },
      ]);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/login');
  };

  const handleCreateMailbox = async () => {
    // Dans un vrai système, ceci ferait un appel API
    console.log('Creating mailbox:', newMailbox);
    setShowNewMailboxDialog(false);
    setNewMailbox({ email: '', displayName: '' });
    // Recharger les données
    await loadDashboardData();
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

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'manager':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    }
  };

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-slate-600" />
          <p className="text-slate-600">Vérification des permissions...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-slate-600">Chargement du tableau de bord...</p>
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
              <Shield className="h-8 w-8 text-purple-600" />
              <div>
                <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Administration
                </h1>
                <p className="text-sm text-slate-500">Tracking Mail</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={loadDashboardData}
                className="hidden sm:flex"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualiser
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-purple-600 text-white">
                        {user?.email?.[0]?.toUpperCase() || 'A'}
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
                        Administrateur
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push('/dashboard')}>
                    <User className="mr-2 h-4 w-4" />
                    <span>Vue utilisateur</span>
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
            Tableau de bord administrateur
          </h2>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Gérez les utilisateurs, boîtes emails et assignations du système.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Utilisateurs totaux
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {stats.totalUsers}
                  </p>
                </div>
                <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full">
                  <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <p className="text-xs text-green-600 mt-2">
                +{stats.activeUsers} actifs
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Boîtes emails
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {stats.totalMailboxes}
                  </p>
                </div>
                <div className="p-3 bg-green-100 dark:bg-green-900 rounded-full">
                  <MailIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <p className="text-xs text-blue-600 mt-2">
                {stats.syncingMailboxes} en synchronisation
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Assignations
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {stats.totalAssignments}
                  </p>
                </div>
                <div className="p-3 bg-yellow-100 dark:bg-yellow-900 rounded-full">
                  <Database className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Actives dans le système
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Activité récente
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {stats.recentActivity}
                  </p>
                </div>
                <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-full">
                  <Activity className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Actions dernière heure
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Users Management */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">Utilisateurs récents</CardTitle>
                <Button size="sm">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Nouvel utilisateur
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {users.map((userData) => (
                  <div key={userData.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {userData.full_name?.[0]?.toUpperCase() || userData.email[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {userData.display_name || userData.full_name}
                        </p>
                        <p className="text-xs text-slate-500">{userData.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getRoleColor(userData.role)}>
                        {userData.role === 'admin' && 'Admin'}
                        {userData.role === 'manager' && 'Manager'}
                        {userData.role === 'user' && 'Utilisateur'}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Eye className="mr-2 h-4 w-4" />
                            Voir détails
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="mr-2 h-4 w-4" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Désactiver
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                Voir tous les utilisateurs
              </Button>
            </CardContent>
          </Card>

          {/* Mailboxes Management */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">Boîtes emails</CardTitle>
                <Dialog open={showNewMailboxDialog} onOpenChange={setShowNewMailboxDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Nouvelle boîte
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Créer une nouvelle boîte email</DialogTitle>
                      <DialogDescription>
                        Ajoutez une nouvelle boîte email à synchroniser avec Microsoft Graph.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="email">Adresse email</Label>
                        <Input
                          id="email"
                          placeholder="support@company.com"
                          value={newMailbox.email}
                          onChange={(e) => setNewMailbox(prev => ({ ...prev, email: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="displayName">Nom d&apos;affichage</Label>
                        <Input
                          id="displayName"
                          placeholder="Support Client"
                          value={newMailbox.displayName}
                          onChange={(e) => setNewMailbox(prev => ({ ...prev, displayName: e.target.value }))}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowNewMailboxDialog(false)}>
                        Annuler
                      </Button>
                      <Button onClick={handleCreateMailbox}>
                        Créer la boîte
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mailboxes.map((mailbox) => (
                  <div key={mailbox.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                        <MailIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {mailbox.display_name || mailbox.email_address}
                        </p>
                        <p className="text-xs text-slate-500">{mailbox.email_address}</p>
                        <p className="text-xs text-slate-400">
                          {mailbox.assigned_users_count} utilisateur(s) assigné(s)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={`${getStatusColor(mailbox.sync_status)} flex items-center space-x-1`}>
                        {mailbox.sync_status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                        {mailbox.sync_status === 'syncing' && <RefreshCw className="h-3 w-3 animate-spin" />}
                        {mailbox.sync_status === 'error' && <AlertCircle className="h-3 w-3" />}
                        <span className="text-xs font-medium">
                          {mailbox.sync_status === 'completed' && 'Synchronisé'}
                          {mailbox.sync_status === 'syncing' && 'En cours'}
                          {mailbox.sync_status === 'error' && 'Erreur'}
                          {mailbox.sync_status === 'pending' && 'En attente'}
                        </span>
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Synchroniser
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Users className="mr-2 h-4 w-4" />
                            Gérer les assignations
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="mr-2 h-4 w-4" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                Voir toutes les boîtes
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}