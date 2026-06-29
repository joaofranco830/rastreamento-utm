import "server-only";
import { getProjectCredential, setProjectCredential } from "@/lib/credentials";
import { handleHotmartWebhook } from "@/lib/sales/webhook";

export const runtime = "nodejs"; // node:crypto + service_role -> não edge
export const dynamic = "force-dynamic"; // webhook nunca é cacheado
export const preferredRegion = "gru1"; // perto do Supabase (sa-east-1)

/**
 * POST /api/webhook/hotmart — rota LEGADA (sem chave) -> Projeto Padrão (id=1).
 * Backward-compat (ADR-v3-8): a integração Hotmart ao vivo NÃO precisa ser
 * reapontada para a v3 entrar no ar. O Hottok vem do cofre do Padrão, com
 * fallback ao env durante a transição. A lógica fica em lib/sales/webhook.
 */

const DEFAULT_PROJECT_ID = 1;

export async function POST(req: Request): Promise<Response> {
  let hottok: string | null = null;
  try {
    hottok = await getProjectCredential(DEFAULT_PROJECT_ID, "hotmart", "hottok");
  } catch {
    // cofre indisponível: cai no env abaixo
  }
  // Transição: se o cofre ainda não tem o Hottok mas o env tem, usa o env E
  // auto-popula o cofre (best-effort, idempotente) — assim paramos de depender
  // do env sem precisar do valor em mãos. Nunca derruba o webhook.
  if (!hottok && process.env.HOTMART_HOTTOK) {
    hottok = process.env.HOTMART_HOTTOK;
    try {
      await setProjectCredential(DEFAULT_PROJECT_ID, "hotmart", "hottok", hottok);
    } catch {
      // se falhar, segue com o valor do env mesmo
    }
  }
  return handleHotmartWebhook(req, DEFAULT_PROJECT_ID, hottok);
}
