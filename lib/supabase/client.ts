import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para uso no NAVEGADOR (componentes 'use client').
 * Usa apenas a anon key pública — nenhum segredo sensível aqui.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
