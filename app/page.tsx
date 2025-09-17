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
    <div className="min-h-screen gradient-bg relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-white/10 animate-float"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-white/5 animate-pulse-slow"></div>
        <div className="absolute top-1/2 left-1/4 w-32 h-32 rounded-full bg-white/10 animate-pulse-slow"></div>
      </div>

      <div className="relative flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-6xl">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="flex items-center justify-center mb-8">
              <div className="relative group">
                <div className="p-6 glass-card rounded-3xl shadow-glow hover-lift">
                  <Mail className="h-16 w-16 text-white animate-float" />
                </div>
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-blue-600/20 to-purple-600/20 blur-xl -z-10 group-hover:blur-2xl transition-all duration-300"></div>
              </div>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight">
              Tracking Mail
            </h1>
            <p className="text-xl md:text-3xl text-white/90 mb-8 font-light">
              Gestion centralisée de vos boîtes emails
            </p>
            <p className="text-lg text-white/80 max-w-3xl mx-auto mb-12 leading-relaxed">
              Accédez à vos boîtes emails assignées, consultez vos messages et gérez votre correspondance
              de manière simple et sécurisée avec notre interface moderne et intuitive.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="glass-card rounded-2xl p-8 hover-lift group">
              <div className="relative mb-6">
                <div className="p-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl w-fit mx-auto shadow-lg group-hover:shadow-xl transition-all duration-300">
                  <Mail className="h-8 w-8 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-400 rounded-full animate-pulse"></div>
              </div>
              <h3 className="text-xl font-bold text-white mb-4 text-center">
                Accès Simplifié
              </h3>
              <p className="text-white/80 text-center leading-relaxed">
                Authentification sécurisée avec contrôle d'accès granulaire.
                Accédez uniquement aux boîtes emails qui vous sont assignées.
              </p>
            </div>

            <div className="glass-card rounded-2xl p-8 hover-lift group">
              <div className="relative mb-6">
                <div className="p-4 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl w-fit mx-auto shadow-lg group-hover:shadow-xl transition-all duration-300">
                  <RefreshCw className="h-8 w-8 text-white animate-spin group-hover:animate-spin" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-400 rounded-full animate-bounce"></div>
              </div>
              <h3 className="text-xl font-bold text-white mb-4 text-center">
                Synchronisation
              </h3>
              <p className="text-white/80 text-center leading-relaxed">
                Synchronisation temps réel avec Microsoft Graph.
                Vos données sont toujours à jour et disponibles instantanément.
              </p>
            </div>

            <div className="glass-card rounded-2xl p-8 hover-lift group">
              <div className="relative mb-6">
                <div className="p-4 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl w-fit mx-auto shadow-lg group-hover:shadow-xl transition-all duration-300">
                  <ArrowRight className="h-8 w-8 text-white group-hover:translate-x-1 transition-transform duration-300" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-pink-400 rounded-full animate-pulse"></div>
              </div>
              <h3 className="text-xl font-bold text-white mb-4 text-center">
                Interface Moderne
              </h3>
              <p className="text-white/80 text-center leading-relaxed">
                Design moderne et responsive construit avec les dernières technologies.
                Expérience utilisateur optimale sur tous les appareils.
              </p>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center">
            <div className="glass-card rounded-3xl p-10 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-white/5 group-hover:from-white/15 group-hover:to-white/10 transition-all duration-500"></div>
              <div className="relative">
                <div className="inline-flex items-center justify-center p-3 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-2xl mb-6 shadow-lg">
                  <Mail className="h-8 w-8 text-white animate-bounce" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                  Prêt à commencer ?
                </h2>
                <p className="text-white/80 mb-8 text-lg max-w-2xl mx-auto leading-relaxed">
                  Rejoignez des milliers d'utilisateurs qui font confiance à Tracking Mail
                  pour gérer leurs communications professionnelles.
                </p>
                <div className="flex flex-col sm:flex-row gap-6 justify-center">
                  <Button
                    size="lg"
                    onClick={() => router.push('/auth/login')}
                    className="bg-white text-blue-600 hover:bg-blue-50 font-semibold px-8 py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 group"
                  >
                    <span className="flex items-center">
                      Se connecter
                      <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
                    </span>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => router.push('/auth/register')}
                    className="border-2 border-white/30 text-white hover:bg-white/10 font-semibold px-8 py-4 rounded-2xl backdrop-blur transition-all duration-300"
                  >
                    Créer un compte
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-16">
            <p className="text-white/60 text-sm">
              © 2024 Tracking Mail. Gestion sécurisée de vos emails.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
