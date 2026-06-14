import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com SERVICE_ROLE — SOMENTE servidor.
 *
 * - Ignora RLS de propósito (nossas tabelas têm RLS ligado SEM políticas,
 *   então só o servidor com esta chave escreve).
 * - `import "server-only"` faz o BUILD FALHAR se este arquivo for importado em
 *   código de client, impedindo que a chave secreta vaze para o navegador.
 * - Use nas rotas de ingestão/webhook/sync (Fases 1, 2, 4). Nunca no dashboard
 *   autenticado (lá usamos lib/supabase/server.ts com a sessão do usuário).
 */
let _admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; // a URL é pública, ok
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // SEGREDO, server-only

  if (!url || !serviceKey) {
    // Falha clara no servidor; não revela qual variável faltou.
    throw new Error("Supabase admin: variáveis de ambiente ausentes.");
  }

  _admin = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return _admin;
}
