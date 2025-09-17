/**
 * Client Supabase pour les composants côté serveur, Server Actions et Route Handlers
 * Utilise @supabase/ssr avec gestion des cookies
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/types/supabase';

export async function createClient() {
  const cookieStore = await cookies();

  // Créer un client Supabase côté serveur avec la configuration des cookies
  // qui peut être utilisé pour maintenir la session utilisateur
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // La méthode `setAll` a été appelée depuis un Server Component.
            // Cela peut être ignoré si vous avez un middleware qui rafraîchit
            // les sessions utilisateur.
          }
        },
      },
    }
  );
}