"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PRODUCT_ROLES, type ProductRole } from "@/lib/config-store";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Garante que há sessão; lança se não houver (server actions são protegidas). */
async function requireUser(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

/** Liga/desliga um produto no dashboard e define o papel. */
export async function updateProduct(
  productId: string,
  included: boolean,
  role: string,
): Promise<ActionResult> {
  if (!(await requireUser())) return { ok: false, error: "não autenticado" };
  if (!PRODUCT_ROLES.includes(role as ProductRole)) return { ok: false, error: "papel inválido" };

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("products")
    .update({ included, role, updated_at: new Date().toISOString() })
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
  if (!(await requireUser())) return { ok: false, error: "não autenticado" };

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
    .eq("id", 1);

  if (error) {
    console.error("[saveCampaignTags] falha:", error.message);
    return { ok: false, error: "falha ao salvar" };
  }
  revalidatePath("/configuracoes");
  return { ok: true, tags };
}

/** Salva a janela de retenção (dias) dos eventos brutos. */
export async function saveRetention(days: number): Promise<ActionResult> {
  if (!(await requireUser())) return { ok: false, error: "não autenticado" };

  const d = Math.floor(days);
  if (!Number.isFinite(d) || d < 1 || d > 3650) {
    return { ok: false, error: "valor inválido (1 a 3650 dias)" };
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("tracking_config")
    .update({ retention_days: d, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) {
    console.error("[saveRetention] falha:", error.message);
    return { ok: false, error: "falha ao salvar" };
  }
  revalidatePath("/configuracoes");
  return { ok: true };
}
