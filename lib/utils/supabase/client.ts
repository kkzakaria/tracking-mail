/**
 * Client Supabase pour les composants côté navigateur
 * Utilise @supabase/ssr (nouvelle approche recommandée)
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types/supabase';

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  // Créer une instance singleton pour éviter les reconnexions multiples
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}