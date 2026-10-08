// SALMO.DEV — Client-Side Authentication Provider (Supabase Auth)
// Reuses existing Supabase project credentials (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY).
// Zero secret exposure: utilizes anon public key exclusively.

import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

let clientAuthInstance: SupabaseClient | null = null;

export function getClientAuth(): SupabaseClient {
  if (typeof window === 'undefined') {
    // Server-side fallback or placeholder
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
    return createClient(url, anon, { auth: { persistSession: false } });
  }

  if (clientAuthInstance) {
    return clientAuthInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[SALMO Auth] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing.');
  }

  clientAuthInstance = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder',
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );

  return clientAuthInstance;
}

export type { User, Session };
