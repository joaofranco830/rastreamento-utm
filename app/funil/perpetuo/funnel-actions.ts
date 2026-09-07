"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { getPerpetuoFunnel } from "@/lib/funnel";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BLOCK_CATALOG, type CustomMetric } from "@/lib/dashboard-metrics";

const BLOCK_KEYS = new Set(BLOCK_CATALOG.map((b) => b.key));

/** Salva só a ordem/seleção ativa de cartões, preservando as pré-definições. */
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
  const dashboard_config = { ...(funnel.dashboard_config ?? {}), cards };
  const { error } = await admin.from("funnels").update({ dashboard_config }).eq("id", funnel.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/funil/perpetuo");
  return { ok: true };
}

/** Salva a config completa do dashboard: cartões ativos (ordenados) + pré-definições + métricas personalizadas. */
export async function saveDashboardLayoutAction(input: {
  cards: string[];
  presets: { name: string; cards: string[] }[];
  customMetrics?: CustomMetric[];
  blocks?: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin", "funcionario"]);
  } catch {
    return { ok: false, error: "Sem permissão." };
  }
  const funnel = await getPerpetuoFunnel(projectId);
  if (!funnel) return { ok: false, error: "Funil não encontrado." };

  // sanitiza: nomes de preset limpos, únicos; cards são strings.
  const presets = (input.presets ?? [])
    .map((p) => ({ name: String(p.name ?? "").trim().slice(0, 60), cards: (p.cards ?? []).map(String) }))
    .filter((p) => p.name.length > 0);
  const custom_metrics = sanitizeCustomMetrics(input.customMetrics);
  const blocks = Array.isArray(input.blocks)
    ? input.blocks.map(String).filter((k) => BLOCK_KEYS.has(k))
    : undefined;

  const admin = getSupabaseAdmin();
  const dashboard_config = { cards: (input.cards ?? []).map(String), presets, custom_metrics, ...(blocks ? { blocks } : {}) };
  const { error } = await admin.from("funnels").update({ dashboard_config }).eq("id", funnel.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/funil/perpetuo");
  return { ok: true };
}

const FORMATS = new Set(["number", "money", "percent", "multiplier"]);
const OPS = new Set(["+", "-", "*", "/"]);

/** Valida/limpa métricas personalizadas antes de gravar (defesa server-side). */
function sanitizeCustomMetrics(list: CustomMetric[] | undefined): CustomMetric[] {
  const out: CustomMetric[] = [];
  const seen = new Set<string>();
  for (const m of list ?? []) {
    const id = String(m?.id ?? "").trim();
    if (!/^custom_[a-z0-9]{4,16}$/.test(id) || seen.has(id)) continue;
    const name = String(m?.name ?? "").trim().slice(0, 60);
    if (!name) continue;
    const format = FORMATS.has(m?.format) ? m.format : "number";
    const formula = (Array.isArray(m?.formula) ? m.formula : [])
      .map((t) => {
        if (t?.kind === "field" && typeof t.key === "string") return { kind: "field" as const, key: t.key.slice(0, 64) };
        if (t?.kind === "num" && isFinite(Number(t.value))) return { kind: "num" as const, value: Number(t.value) };
        if (t?.kind === "op" && OPS.has(t.op)) return { kind: "op" as const, op: t.op };
        if (t?.kind === "lp") return { kind: "lp" as const };
        if (t?.kind === "rp") return { kind: "rp" as const };
        return null;
      })
      .filter(Boolean) as CustomMetric["formula"];
    if (formula.length === 0) continue;
    seen.add(id);
    out.push({ id, name, format, formula });
  }
  return out.slice(0, 50); // teto de segurança
}

/** Salva quais contas de anúncio ESTE funil mostra no dashboard (vazio = todas). */
export async function saveDashboardAccountsAction(accountIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin", "funcionario"]);
  } catch {
    return { ok: false, error: "Sem permissão." };
  }
  const funnel = await getPerpetuoFunnel(projectId);
  if (!funnel) return { ok: false, error: "Funil não encontrado." };

  const accs = Array.from(new Set((accountIds ?? []).map((a) => a.trim().replace(/^act_/, "")).filter(Boolean)));
  const source_filters = { ...(funnel.source_filters ?? {}), ad_accounts: accs };

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("funnels").update({ source_filters }).eq("id", funnel.id);
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
