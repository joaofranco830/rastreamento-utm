import { brl, inteiro, pct, mult } from "@/lib/format";
import type { CampaignRow, CreativeRow } from "@/lib/campanhas";

/** Colunas da tabela de campanhas (§8.3), calculadas dos agregados-base. */

export const n = (v: unknown): number => Number(v) || 0;
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const brlN = (x: number | null): string => (x == null ? "—" : brl(x));
const cpm = (spend: number, impr: number): number | null => (impr > 0 ? (spend / impr) * 1000 : null);

export interface Col<T> {
  h: string;
  f: (r: T) => string;
}

export const COLS: Col<CampaignRow>[] = [
  { h: "Gasto", f: (r) => brl(r.spend) },
  { h: "Faturamento", f: (r) => brl(r.net_revenue) },
  { h: "ROAS", f: (r) => mult(ratio(n(r.net_revenue), n(r.spend))) },
  { h: "Lucro", f: (r) => brl(n(r.net_revenue) - n(r.spend)) },
  { h: "Compras", f: (r) => inteiro(r.purchases_total) },
  { h: "Compras (princ.)", f: (r) => inteiro(r.purchases_principal) },
  { h: "Custo/venda", f: (r) => brlN(ratio(n(r.spend), n(r.purchases_total))) },
  { h: "Custo/venda princ.", f: (r) => brlN(ratio(n(r.spend), n(r.purchases_principal))) },
  { h: "Ticket", f: (r) => brlN(ratio(n(r.net_revenue), n(r.purchases_total))) },
  { h: "Reembolsos", f: (r) => inteiro(r.reverted) },
  { h: "Taxa reemb.", f: (r) => pct(ratio(n(r.reverted), n(r.paid))) },
  { h: "Impressões", f: (r) => inteiro(r.impressions) },
  { h: "CPM", f: (r) => brlN(cpm(n(r.spend), n(r.impressions))) },
  { h: "Cliques", f: (r) => inteiro(r.link_clicks) },
  { h: "CPC", f: (r) => brlN(ratio(n(r.spend), n(r.link_clicks))) },
  { h: "Views 3s", f: (r) => inteiro(r.video_3s) },
  { h: "Plays", f: (r) => inteiro(r.video_plays) },
  { h: "Assist. 75%", f: (r) => inteiro(r.video_p75) },
  { h: "Hook rate", f: (r) => pct(ratio(n(r.video_3s), n(r.impressions))) },
  { h: "Retenção", f: (r) => pct(ratio(n(r.video_p75), n(r.video_plays))) },
  { h: "CTR cta", f: (r) => pct(ratio(n(r.link_clicks), n(r.video_p95))) },
  { h: "CTR", f: (r) => pct(ratio(n(r.link_clicks), n(r.impressions))) },
  { h: "Connect rate", f: (r) => pct(ratio(n(r.pageviews), n(r.link_clicks))) },
  { h: "LPV", f: (r) => inteiro(r.pageviews) },
  { h: "Ida ckt", f: (r) => pct(ratio(n(r.checkouts), n(r.pageviews))) },
  { h: "Initiate ckt", f: (r) => inteiro(r.checkouts) },
  { h: "Conv. ckt", f: (r) => pct(ratio(n(r.purchases_total), n(r.checkouts))) },
  { h: "Conv. funil", f: (r) => pct(ratio(n(r.purchases_total), n(r.pageviews))) },
  { h: "Compra/clique", f: (r) => pct(ratio(n(r.purchases_total), n(r.link_clicks))) },
];

export const CREATIVE_COLS: Col<CreativeRow>[] = [
  { h: "Gasto", f: (r) => brl(r.spend) },
  { h: "Faturamento", f: (r) => brl(r.net_revenue) },
  { h: "ROAS", f: (r) => mult(ratio(n(r.net_revenue), n(r.spend))) },
  { h: "Lucro", f: (r) => brl(n(r.net_revenue) - n(r.spend)) },
  { h: "Compras", f: (r) => inteiro(r.purchases_total) },
  { h: "Custo/venda", f: (r) => brlN(ratio(n(r.spend), n(r.purchases_total))) },
  { h: "Ticket", f: (r) => brlN(ratio(n(r.net_revenue), n(r.purchases_total))) },
  { h: "Reembolsos", f: (r) => inteiro(r.reverted) },
  { h: "Impressões", f: (r) => inteiro(r.impressions) },
  { h: "CPM", f: (r) => brlN(cpm(n(r.spend), n(r.impressions))) },
  { h: "Cliques", f: (r) => inteiro(r.link_clicks) },
  { h: "CPC", f: (r) => brlN(ratio(n(r.spend), n(r.link_clicks))) },
  { h: "Views 3s", f: (r) => inteiro(r.video_3s) },
  { h: "Plays", f: (r) => inteiro(r.video_plays) },
  { h: "Hook rate", f: (r) => pct(ratio(n(r.video_3s), n(r.impressions))) },
  { h: "Retenção", f: (r) => pct(ratio(n(r.video_p75), n(r.video_plays))) },
  { h: "CTR cta", f: (r) => pct(ratio(n(r.link_clicks), n(r.video_p95))) },
  { h: "CTR", f: (r) => pct(ratio(n(r.link_clicks), n(r.impressions))) },
];
