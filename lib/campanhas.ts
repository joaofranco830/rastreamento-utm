import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Leitura da Tela Campanhas (server-only) via service_role. */

export type Level = "campaign" | "adset" | "creative";

export interface CampaignRow {
  meta_id: string;
  name: string | null;
  effective_status: string | null;
  spend: number;
  net_revenue: number;
  purchases_total: number;
  purchases_principal: number;
  reverted: number;
  paid: number;
  impressions: number;
  link_clicks: number;
  video_3s: number;
  video_p75: number;
  video_p95: number;
  video_plays: number;
  pageviews: number;
  checkouts: number;
}

export interface CreativeRow {
  name: string | null;
  spend: number;
  net_revenue: number;
  purchases_total: number;
  purchases_principal: number;
  reverted: number;
  paid: number;
  impressions: number;
  link_clicks: number;
  video_3s: number;
  video_p75: number;
  video_p95: number;
  video_plays: number;
}

export async function getCampaignsTable(
  level: Level,
  parentId: string | null,
  from: string,
  to: string,
): Promise<CampaignRow[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("campaigns_table", {
    p_level: level,
    p_parent_id: parentId,
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(`campaigns_table: ${error.message}`);
  return (data ?? []) as CampaignRow[];
}

export async function getCreativesConsolidated(from: string, to: string): Promise<CreativeRow[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("creatives_consolidated", { p_from: from, p_to: to });
  if (error) throw new Error(`creatives_consolidated: ${error.message}`);
  return (data ?? []) as CreativeRow[];
}
