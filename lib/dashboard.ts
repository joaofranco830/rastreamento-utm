import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Leitura do dashboard (server-only). Usa o cliente admin porque as funções de
 * métrica são revogadas de anon/authenticated; a página já é protegida por login.
 */

/** Data no fuso do negócio (America/Sao_Paulo), YYYY-MM-DD, com offset em dias. */
export function spDate(offsetDays = 0): string {
  const d = new Date(Date.now() - offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

export interface DashboardSummary {
  invested: number;
  net_revenue: number;
  gross_revenue: number;
  refunded: number;
  net_sales: number;
  paid_count: number;
  reverted_count: number;
  roas: number | null;
  refund_rate_count: number;
  refund_rate_value: number;
  pageviews: number;
  checkouts: number;
  meta: { impressions: number; clicks: number; link_clicks: number; lpv: number; ic: number; purchases: number };
  funnel: { connect_rate: number | null; to_checkout: number | null; checkout_conv: number | null; funnel_conv: number | null };
}

export interface CampaignRow {
  campaign: string | null;
  invested: number;
  net_revenue: number;
  net_sales: number;
  roas: number | null;
}

export interface DashboardData {
  dias: number;
  from: string;
  to: string;
  summary: DashboardSummary | null;
  campaigns: CampaignRow[];
  lastSyncAt: string | null;
  lastStatus: string | null;
}

const ALLOWED_DIAS = [7, 14, 30, 90];

export async function getDashboardData(diasRaw?: string): Promise<DashboardData> {
  const dias = ALLOWED_DIAS.includes(Number(diasRaw)) ? Number(diasRaw) : 14;
  const to = spDate(0);
  const from = spDate(dias - 1);
  const supa = getSupabaseAdmin();

  const [summaryRes, campaignsRes, stateRes, lastSyncRes] = await Promise.all([
    supa.rpc("dashboard_summary", { p_from: from, p_to: to }),
    supa.rpc("dashboard_by_campaign", { p_from: from, p_to: to }),
    supa.from("meta_sync_state").select("last_finished_at,last_status").maybeSingle(),
    supa.from("meta_insights_daily").select("synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return {
    dias,
    from,
    to,
    summary: (summaryRes.data as DashboardSummary) ?? null,
    campaigns: (campaignsRes.data as CampaignRow[]) ?? [],
    lastSyncAt: stateRes.data?.last_finished_at ?? lastSyncRes.data?.synced_at ?? null,
    lastStatus: stateRes.data?.last_status ?? null,
  };
}
