"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { getPerpetuoFunnel } from "@/lib/funnel";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Salva a pré-definição de métricas visíveis no Dashboard (Configurar dashboard). */
export async function saveDashboardConfigAction(cards: string[]): Promise<{ ok: boolean; error?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin", "funcionario"]);
  } catch {
    return { ok: false, error: "Sem permissão." };
  }
  const funnel = await getPerpetuoFunnel(projectId);
  if (!funnel) return { ok: false, error: "Funil não encontrado." };
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("funnels").update({ dashboard_config: { cards } }).eq("id", funnel.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/funil/perpetuo");
  return { ok: true };
}

export interface FunnelConfigInput {
  campaignMode: "all" | "contains";
  tags: string[];
  productMode: "all" | "included";
  includedProductIds: string[];
  offerProductId: string | null;
  recurrence: "all" | "first";
  adAccount: string | null;
}

/** Salva a config do funil (ENG-05) e aplica nos lugares que os dashboards já leem. */
export async function saveFunnelConfigAction(input: FunnelConfigInput): Promise<{ ok: boolean; error?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin", "funcionario"]);
  } catch {
    return { ok: false, error: "Sem permissão." };
  }
  const funnel = await getPerpetuoFunnel(projectId);
  if (!funnel) return { ok: false, error: "Funil não encontrado." };
  const admin = getSupabaseAdmin();

  const source_filters = {
    campaign: { mode: input.campaignMode, tags: input.campaignMode === "contains" ? input.tags : [] },
    product: { mode: input.productMode, product_ids: input.includedProductIds, offer: input.offerProductId },
    recurrence: input.recurrence,
    ad_account: input.adAccount,
  };
  const { error } = await admin.from("funnels").update({ source_filters }).eq("id", funnel.id);
  if (error) return { ok: false, error: error.message };

  // Aplica o que os dashboards atuais já consomem (tags + produtos incluídos do projeto).
  await admin.from("tracking_config").update({ campaign_name_tags: source_filters.campaign.tags }).eq("project_id", projectId);
  await admin.from("products").update({ included: false }).eq("project_id", projectId);
  if (input.productMode === "included" && input.includedProductIds.length > 0) {
    await admin
      .from("products")
      .update({ included: true })
      .eq("project_id", projectId)
      .in("product_id", input.includedProductIds);
  }

  revalidatePath("/funil/perpetuo");
  return { ok: true };
}
