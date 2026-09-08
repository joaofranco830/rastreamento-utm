import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Leitura da Tela Campanhas (server-only) POR PROJETO, via sessão do usuário (RLS). */

export type Level = "campaign" | "adset" | "creative";

/** Métricas-base por entidade (campanha/conjunto/anúncio ou criativo consolidado). */
export interface Metrics {
  spend: number;
  impressions: number;
  link_clicks: number;
  leads: number;
  follows: number;
  video_3s: number;
  video_p25: number;
  video_p50: number;
  video_p75: number;
  video_p95: number;
  video_p100: number;
  video_plays: number;
  net_revenue: number;
  rev_principal: number;
  refunded_value: number;
  refund_count: number;
  purchases_total: number;
  purchases_principal: number;
  reverted: number;
  paid: number;
  unique_customers: number;
  pageviews: number;
  checkouts: number;
}

export interface CampaignRow extends Metrics {
  meta_id: string;
  name: string | null;
  effective_status: string | null;
}

export interface CreativeRow extends Metrics {
  name: string | null;
}

export async function getCampaignsTable(
  projectId: number,
  level: Level,
  parentIds: string[] | null,
  productIds: string[] | null,
  from: string,
  to: string,
  limit = 20,
): Promise<CampaignRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("campaigns_table", {
    p_project_id: projectId,
    p_level: level,
    p_parent_ids: parentIds && parentIds.length > 0 ? parentIds : null,
    p_product_ids: productIds && productIds.length > 0 ? productIds : null,
    p_from: from,
    p_to: to,
    p_limit: limit,
  });
  if (error) throw new Error(`campaigns_table: ${error.message}`);
  return (data ?? []) as CampaignRow[];
}

export async function getCreativesConsolidated(
  projectId: number,
  productIds: string[] | null,
  from: string,
  to: string,
): Promise<CreativeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creatives_consolidated", {
    p_project_id: projectId,
    p_product_ids: productIds && productIds.length > 0 ? productIds : null,
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(`creatives_consolidated: ${error.message}`);
  return (data ?? []) as CreativeRow[];
}
