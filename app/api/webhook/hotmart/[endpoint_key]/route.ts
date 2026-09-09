import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProjectCredential } from "@/lib/credentials";
import { handleHotmartWebhook } from "@/lib/sales/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "gru1";

/**
 * POST /api/webhook/hotmart/{endpoint_key} — rota POR PROJETO (ADR-v3-8).
 * Resolve o projeto pela endpoint_key (não-enumerável, não é segredo), carrega
 * o Hottok do cofre do projeto e delega para o handler compartilhado.
 */

export async function POST(
  req: Request,
  { params }: { params: Promise<{ endpoint_key: string }> },
): Promise<Response> {
  const { endpoint_key } = await params;

  const supa = getSupabaseAdmin();
  const { data: ep, error } = await supa
    .from("project_endpoints")
    .select("project_id, active")
    .eq("endpoint_key", endpoint_key)
    .maybeSingle();

  if (error || !ep || !ep.active) {
    console.warn("[webhook] endpoint_key inexistente/inativo — 404");
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const projectId = ep.project_id as number;

  let hottok: string | null = null;
  try {
    hottok = await getProjectCredential(projectId, "hotmart", "hottok");
  } catch {
    // cofre indisponível — o handler valida e rejeita se não houver hottok
  }

  return handleHotmartWebhook(req, projectId, hottok);
}
