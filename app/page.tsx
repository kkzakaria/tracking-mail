'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabaseAuth } from '@/lib/hooks/use-user-mailboxes';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, RefreshCw, ArrowRight } from 'lucide-react';

export default function Home() {
  const { isAuthenticated, loading } = useSupabaseAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-slate-600" />
          <p className="text-slate-600 dark:text-slate-400">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-4xl">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-6">
              <div className="p-4 bg-blue-600 rounded-2xl shadow-lg">
                <Mail className="h-12 w-12 text-white" />
              </div>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-slate-100 mb-4">
              Tracking Mail
            </h1>
            <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-400 mb-8">
              Gestion centralisée de vos boîtes emails
            </p>
            <p className="text-lg text-slate-500 dark:text-slate-500 max-w-2xl mx-auto mb-8">
              Accédez à vos boîtes emails assignées, consultez vos messages et gérez votre correspondance
              de manière simple et sécurisée.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <Card className="border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg w-fit mx-auto mb-4">
                  <Mail className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  Accès Simplifié
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Authentification simple avec email et mot de passe. Accédez uniquement aux boîtes qui vous sont assignées.
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg w-fit mx-auto mb-4">
                  <RefreshCw className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  Synchronisation
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Synchronisation automatique avec Microsoft Graph pour des données toujours à jour.
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg w-fit mx-auto mb-4">
                  <ArrowRight className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  Interface Moderne
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Interface utilisateur moderne et intuitive construite avec les dernières technologies.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Call to Action */}
          <div className="text-center">
            <Card className="border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur">
              <CardContent className="p-8">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">
                  Prêt à commencer ?
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-6">
                  Connectez-vous à votre compte pour accéder à vos boîtes emails.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button
                    size="lg"
                    onClick={() => router.push('/auth/login')}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Se connecter
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => router.push('/auth/register')}
                  >
                    Créer un compte
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Footer */}
          <div className="text-center mt-12">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              © 2024 Tracking Mail. Gestion sécurisée de vos emails.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
