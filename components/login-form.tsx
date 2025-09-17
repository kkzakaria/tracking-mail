'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabaseAuth } from '@/lib/hooks/use-user-mailboxes';
import { Loader2, AlertCircle } from 'lucide-react';

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, loading, error } = useSupabaseAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await signIn(email, password);

    // Redirect on successful login
    if (result && !error) {
      router.push('/dashboard');
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <div className="p-8">
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold text-white mb-2">Bon retour !</h2>
          <p className="text-white/70 text-sm">
            Connectez-vous avec votre email et mot de passe
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6">
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 backdrop-blur">
                <div className="flex items-center gap-2 justify-center">
                  <AlertCircle className="h-4 w-4 text-red-200" />
                  <p className="text-sm text-red-200">
                    {error}
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-6">
              <div className="grid gap-3">
                <Label htmlFor="email" className="text-white/90 text-sm font-medium">Adresse email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="votre.email@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="py-3 bg-white/10 border-white/20 text-white placeholder-white/50 rounded-xl focus:bg-white/15 focus:border-white/40 transition-all duration-200"
                />
              </div>
              <div className="grid gap-3">
                <div className="flex items-center">
                  <Label htmlFor="password" className="text-white/90 text-sm font-medium">Mot de passe</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="ml-auto text-sm underline-offset-4 hover:underline text-white/70 hover:text-white transition-colors"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="Votre mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="py-3 bg-white/10 border-white/20 text-white placeholder-white/50 rounded-xl focus:bg-white/15 focus:border-white/40 transition-all duration-200"
                />
              </div>
              <Button
                type="submit"
                className="w-full py-3 mt-2 bg-white text-blue-600 hover:bg-blue-50 font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50"
                disabled={loading || !email || !password}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connexion en cours...
                  </>
                ) : (
                  'Se connecter'
                )}
              </Button>
            </div>
            <div className="text-center text-sm">
              <span className="text-white/70">Pas encore de compte ?</span>{" "}
              <Link href="/auth/register" className="underline underline-offset-4 text-white hover:text-white/80 transition-colors">
                Créer un compte
              </Link>
            </div>
          </div>
        </form>
      </div>
      <div className="text-center text-xs text-balance px-8 pb-8">
        <span className="text-white/50">En vous connectant, vous acceptez nos</span>{" "}
        <Link href="/terms" className="underline underline-offset-4 hover:text-white/80 text-white/60 transition-colors">
          Conditions d&apos;utilisation
        </Link>{" "}
        <span className="text-white/50">et notre</span>{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-white/80 text-white/60 transition-colors">
          Politique de confidentialité
        </Link>
        <span className="text-white/50">.</span>
      </div>
    </div>
  )
}
