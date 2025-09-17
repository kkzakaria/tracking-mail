/**
 * Middleware Next.js pour la gestion des sessions Supabase
 * Rafraîchit automatiquement les tokens d'authentification
 */

import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  // Mettre à jour la session utilisateur
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Correspond à tous les chemins de requête sauf ceux commençant par :
     * - _next/static (fichiers statiques)
     * - _next/image (fichiers d'optimisation d'images)
     * - favicon.ico (fichier favicon)
     * - *.svg, *.png, *.jpg, *.jpeg, *.gif, *.webp (fichiers image statiques)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};