import "server-only";
import { getProjectCredential } from "@/lib/credentials";
import { handleHotmartWebhook } from "@/lib/sales/webhook";

export const runtime = "nodejs"; // node:crypto + service_role -> não edge
export const dynamic = "force-dynamic"; // webhook nunca é cacheado
export const preferredRegion = "gru1"; // perto do Supabase (sa-east-1)

/**
 * POST /api/webhook/hotmart — rota LEGADA (sem chave) -> Projeto Padrão (id=1).
 * Backward-compat (ADR-v3-8) para a integração Hotmart histórica. O Hottok vem
 * SEMPRE do cofre do projeto 1 (sem env global). Projetos novos usam a rota
 * por chave /api/webhook/hotmart/{endpoint_key}. Lógica em lib/sales/webhook.
 */

const DEFAULT_PROJECT_ID = 1;

export async function POST(req: Request): Promise<Response> {
  let hottok: string | null = null;
  try {
    hottok = await getProjectCredential(DEFAULT_PROJECT_ID, "hotmart", "hottok");
  } catch {
    // cofre indisponível: o handler valida e rejeita se não houver hottok
  }
  return handleHotmartWebhook(req, DEFAULT_PROJECT_ID, hottok);
}
