import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Leitura da Tela Central (server-only) POR PROJETO. Chama central_summary +
 * central_timeseries via SESSÃO do usuário (RLS por filiação garante que só
 * retorna dados de projeto autorizado — ADR-v3-4/11).
 */

export interface ProductBreakdown {
  product_id: string;
  name: string;
  role: string;
  net_revenue: number;
  net_sales: number;
  paid: number;
  refund_count: number;
  refunded_value: number;
}

export interface PaymentBreakdown {
  type: string;
  net_revenue: number;
  net_sales: number;
}

export interface RefundBucket {
  count: number;
  value: number;
}

export interface RefundBreakdown {
  refunded: RefundBucket;
  chargeback: RefundBucket;
  total: RefundBucket;
}

export interface LostSummary {
  canceled: RefundBucket;
  unpaid: RefundBucket;
  pix_total: number;
  pix_paid: number;
  pix_unpaid: number;
  checkout: { entered: number; bought: number; unpaid: number; canceled: number; abandoned: number };
}

export interface LtvSummary {
  unique_customers: number;
  ticket: number | null;
  repurchase_rate: number | null;
  subscriptions: number;
  new_subscriptions: number;
  renewals: number;
  renewal_rate: number | null;
}

export interface CentralSummary {
  period: { from: string; to: string };
  invested: number;
  net_revenue: number;
  gross_revenue: number;
  refunded: number;
  profit: number;
  net_sales: number;
  net_sales_principal: number;
  paid_count: number;
  reverted_count: number;
  roas: number | null;
  cac_total: number | null;
  cac_principal: number | null;
  ticket_medio: number | null;
  refund_rate_count: number;
  refund_rate_value: number;
  revenue_by_role: Record<string, number>;
  sales_by_role: Record<string, number>;
  by_product: ProductBreakdown[];
  by_payment: PaymentBreakdown[];
  refunds: RefundBreakdown;
  lost: LostSummary;
  ltv: LtvSummary;
  pageviews: number;
  checkouts: number;
  pageviews_source: "pixel" | "meta";
  checkouts_source: "pixel" | "meta";
  meta: {
    impressions: number;
    clicks: number;
    link_clicks: number;
    lpv: number;
    ic: number;
    purchases: number;
    leads: number;
    follows: number;
    video_3s: number;
    video_plays: number;
    video_p25: number;
    video_p50: number;
    video_p75: number;
    video_p95: number;
    video_p100: number;
  };
  funnel: {
    connect_rate: number | null;
    to_checkout: number | null;
    checkout_conv: number | null;
    funnel_conv: number | null;
  };
}

export interface TimeseriesPoint {
  day: string;
  invested: number;
  net_revenue: number;
  profit: number;
  roas: number | null;
}

export interface CentralScope {
  included_products: number;
  total_products: number;
  tags: string[];
}

export interface CentralData {
  from: string;
  to: string;
  summary: CentralSummary;
  series: TimeseriesPoint[];
  scope: CentralScope;
}

/** Data no fuso do negócio (America/Sao_Paulo), YYYY-MM-DD, com offset em dias. */
export function spDate(offsetDays = 0): string {
  const d = new Date(Date.now() - offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/** Resolve o período a partir dos parâmetros da URL (custom > preset). */
export function resolveRange(params: { from?: string; to?: string; dias?: string }): {
  from: string;
  to: string;
  dias: number | null;
} {
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (isDate(params.from) && isDate(params.to)) {
    const from = params.from!;
    const to = params.to!;
    return from <= to ? { from, to, dias: null } : { from: to, to: from, dias: null };
  }
  // Aceita qualquer preset de 1 a 730 dias (2 anos); fora disso, 14 (padrão).
  const n = Number(params.dias);
  const dias = Number.isInteger(n) && n >= 1 && n <= 730 ? n : 14;
  return { from: spDate(dias - 1), to: spDate(0), dias };
}

export async function getCentral(
  projectId: number,
  from: string,
  to: string,
  adAccounts?: string[] | null,
): Promise<CentralData> {
  const supabase = await createClient();
  // Vazio/ausente = todas as contas; senão, filtra o investido/Meta por conta.
  const p_ad_accounts = adAccounts && adAccounts.length > 0 ? adAccounts : null;
  const [s, t, prods, cfg] = await Promise.all([
    supabase.rpc("central_summary", { p_project_id: projectId, p_from: from, p_to: to, p_ad_accounts }),
    supabase.rpc("central_timeseries", { p_project_id: projectId, p_from: from, p_to: to, p_ad_accounts }),
    supabase.from("products").select("included").eq("project_id", projectId),
    supabase.from("tracking_config").select("campaign_name_tags").eq("project_id", projectId).maybeSingle(),
  ]);
  if (s.error) throw new Error(`central_summary: ${s.error.message}`);
  if (t.error) throw new Error(`central_timeseries: ${t.error.message}`);

  const products = (prods.data ?? []) as { included: boolean }[];
  return {
    from,
    to,
    summary: s.data as CentralSummary,
    series: (t.data ?? []) as TimeseriesPoint[],
    scope: {
      included_products: products.filter((p) => p.included).length,
      total_products: products.length,
      tags: (cfg.data?.campaign_name_tags ?? []) as string[],
    },
  };
}
