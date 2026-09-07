"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { PRODUCT_ROLES, type ProductRole } from "@/lib/config-store";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Resolve o projeto ATIVO (validado contra a filiação sob RLS) e exige papel de
 * edição. Toda escrita de config é escopada a este projeto — nunca a um id vindo
 * do client. Retorna o project_id ou uma falha padronizada.
 */
async function requireEditableProject(): Promise<{ projectId: number } | { error: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin", "funcionario"]);
  } catch {
    return { error: "Sem permissão para editar a configuração deste projeto." };
  }
  return { projectId };
}

/** Liga/desliga um produto no dashboard DO PROJETO ATIVO e define o papel. */
export async function updateProduct(
  productId: string,
  included: boolean,
  role: string,
): Promise<ActionResult> {
  const scope = await requireEditableProject();
  if ("error" in scope) return { ok: false, error: scope.error };
  if (!PRODUCT_ROLES.includes(role as ProductRole)) return { ok: false, error: "papel inválido" };

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("products")
    .update({ included, role, updated_at: new Date().toISOString() })
    .eq("project_id", scope.projectId)
    .eq("product_id", productId);

  if (error) {
    console.error("[updateProduct] falha:", error.message);
    return { ok: false, error: "falha ao salvar" };
  }
  revalidatePath("/configuracoes");
  return { ok: true };
}

/**
 * Salva as tags de campanha. O usuário digita texto livre (uma tag por linha
 * ou separadas por vírgula); aqui normalizamos: trim, remove vazias e duplicadas.
 */
export async function saveCampaignTags(raw: string): Promise<ActionResult & { tags?: string[] }> {
  const scope = await requireEditableProject();
  if ("error" in scope) return { ok: false, error: scope.error };

  const tags = Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("tracking_config")
    .update({ campaign_name_tags: tags, updated_at: new Date().toISOString() })
    .eq("project_id", scope.projectId);

  if (error) {
    console.error("[saveCampaignTags] falha:", error.message);
    return { ok: false, error: "falha ao salvar" };
  }
  revalidatePath("/configuracoes");
  return { ok: true, tags };
}

/** Salva a janela de retenção (dias) dos eventos brutos DO PROJETO ATIVO. */
export async function saveRetention(days: number): Promise<ActionResult> {
  const scope = await requireEditableProject();
  if ("error" in scope) return { ok: false, error: scope.error };

  const d = Math.floor(days);
  if (!Number.isFinite(d) || d < 1 || d > 3650) {
    return { ok: false, error: "valor inválido (1 a 3650 dias)" };
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("tracking_config")
    .update({ retention_days: d, updated_at: new Date().toISOString() })
    .eq("project_id", scope.projectId);

  if (error) {
    console.error("[saveRetention] falha:", error.message);
    return { ok: false, error: "falha ao salvar" };
  }
  revalidatePath("/configuracoes");
  return { ok: true };
}
