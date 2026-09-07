import { brl, inteiro, pct, mult } from "@/lib/format";
import type { Metrics } from "@/lib/campanhas";

/** Catálogo de colunas da Tela Campanhas (estilo Gerenciador). Cada coluna é
 *  calculada a partir das métricas-base da entidade. */

const num = (v: unknown): number => Number(v) || 0;
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const brlN = (x: number | null): string => (x == null ? "—" : brl(x));
const cpm = (spend: number, impr: number): number | null => (impr > 0 ? (spend / impr) * 1000 : null);

export interface ColDef {
  key: string;
  label: string;
  group: string;
  fmt: (r: Metrics) => string;
}

export const COLUMN_CATALOG: ColDef[] = [
  // Resultado
  { key: "spend", label: "Valor gasto", group: "Resultado", fmt: (r) => brl(r.spend) },
  { key: "net_revenue", label: "Faturamento", group: "Resultado", fmt: (r) => brl(r.net_revenue) },
  { key: "roas", label: "ROAS", group: "Resultado", fmt: (r) => mult(ratio(num(r.net_revenue), num(r.spend))) },
  { key: "profit", label: "Lucro", group: "Resultado", fmt: (r) => brl(num(r.net_revenue) - num(r.spend)) },
  { key: "purchases_total", label: "Compras", group: "Resultado", fmt: (r) => inteiro(r.purchases_total) },
  { key: "cpa", label: "Custo/compra", group: "Resultado", fmt: (r) => brlN(ratio(num(r.spend), num(r.purchases_total))) },
  { key: "ticket", label: "Ticket", group: "Resultado", fmt: (r) => brlN(ratio(num(r.net_revenue), num(r.purchases_total))) },
  { key: "receita_clique", label: "Receita por clique", group: "Resultado", fmt: (r) => brlN(ratio(num(r.net_revenue), num(r.link_clicks))) },

  // Front x outros produtos
  { key: "purchases_principal", label: "Compras (front)", group: "Produtos", fmt: (r) => inteiro(r.purchases_principal) },
  { key: "rev_principal", label: "Faturamento (front)", group: "Produtos", fmt: (r) => brl(r.rev_principal) },
  { key: "cpa_principal", label: "Custo/compra front", group: "Produtos", fmt: (r) => brlN(ratio(num(r.spend), num(r.purchases_principal))) },
  { key: "sales_others", label: "Vendas outros produtos", group: "Produtos", fmt: (r) => inteiro(num(r.purchases_total) - num(r.purchases_principal)) },
  { key: "rev_others", label: "Faturamento outros produtos", group: "Produtos", fmt: (r) => brl(num(r.net_revenue) - num(r.rev_principal)) },

  // Reembolso
  { key: "refund_count", label: "Reembolsos", group: "Reembolso", fmt: (r) => inteiro(r.refund_count) },
  { key: "refunded_value", label: "Valor reembolsado", group: "Reembolso", fmt: (r) => brl(r.refunded_value) },
  { key: "refund_rate", label: "Taxa de reembolso", group: "Reembolso", fmt: (r) => pct(ratio(num(r.refund_count), num(r.paid))) },

  // LTV
  { key: "unique_customers", label: "Clientes únicos", group: "LTV", fmt: (r) => inteiro(r.unique_customers) },
  { key: "ltv_ticket", label: "LTV (ticket/cliente)", group: "LTV", fmt: (r) => brlN(ratio(num(r.net_revenue), num(r.unique_customers))) },

  // Tráfego
  { key: "impressions", label: "Impressões", group: "Tráfego", fmt: (r) => inteiro(r.impressions) },
  { key: "cpm", label: "CPM", group: "Tráfego", fmt: (r) => brlN(cpm(num(r.spend), num(r.impressions))) },
  { key: "link_clicks", label: "Cliques no link", group: "Tráfego", fmt: (r) => inteiro(r.link_clicks) },
  { key: "cpc", label: "CPC", group: "Tráfego", fmt: (r) => brlN(ratio(num(r.spend), num(r.link_clicks))) },
  { key: "ctr", label: "CTR", group: "Tráfego", fmt: (r) => pct(ratio(num(r.link_clicks), num(r.impressions))) },
  { key: "leads", label: "Leads", group: "Tráfego", fmt: (r) => inteiro(r.leads) },
  { key: "follows", label: "Seguidores", group: "Tráfego", fmt: (r) => inteiro(r.follows) },

  // Vídeo
  { key: "video_plays", label: "Reproduções", group: "Vídeo", fmt: (r) => inteiro(r.video_plays) },
  { key: "video_3s", label: "Reproduções 3s", group: "Vídeo", fmt: (r) => inteiro(r.video_3s) },
  { key: "video_p25", label: "25%", group: "Vídeo", fmt: (r) => inteiro(r.video_p25) },
  { key: "video_p50", label: "50%", group: "Vídeo", fmt: (r) => inteiro(r.video_p50) },
  { key: "video_p75", label: "75%", group: "Vídeo", fmt: (r) => inteiro(r.video_p75) },
  { key: "video_p95", label: "95%", group: "Vídeo", fmt: (r) => inteiro(r.video_p95) },
  { key: "video_p100", label: "100%", group: "Vídeo", fmt: (r) => inteiro(r.video_p100) },
  { key: "hook_rate", label: "Hook rate", group: "Vídeo", fmt: (r) => pct(ratio(num(r.video_3s), num(r.impressions))) },
  { key: "retention", label: "Retenção 75%", group: "Vídeo", fmt: (r) => pct(ratio(num(r.video_p75), num(r.video_plays))) },

  // Funil (rastreio)
  { key: "pageviews", label: "Page views", group: "Funil", fmt: (r) => inteiro(r.pageviews) },
  { key: "checkouts", label: "Checkouts", group: "Funil", fmt: (r) => inteiro(r.checkouts) },
  { key: "connect_rate", label: "Connect rate", group: "Funil", fmt: (r) => pct(ratio(num(r.pageviews), num(r.link_clicks))) },
  { key: "conv_ckt", label: "Conv. checkout", group: "Funil", fmt: (r) => pct(ratio(num(r.purchases_total), num(r.checkouts))) },
  { key: "conv_funil", label: "Conv. funil", group: "Funil", fmt: (r) => pct(ratio(num(r.purchases_total), num(r.pageviews))) },
];

export const COLUMN_GROUPS = ["Resultado", "Produtos", "Reembolso", "LTV", "Tráfego", "Vídeo", "Funil"] as const;

export const COLUMN_LABEL: Record<string, string> = Object.fromEntries(COLUMN_CATALOG.map((c) => [c.key, c.label]));
export const COLUMN_FMT: Record<string, (r: Metrics) => string> = Object.fromEntries(
  COLUMN_CATALOG.map((c) => [c.key, c.fmt]),
);

/** Colunas padrão (estilo Gerenciador), na ordem em que aparecem. */
export const DEFAULT_COLUMNS = [
  "spend",
  "purchases_total",
  "cpa",
  "roas",
  "net_revenue",
  "receita_clique",
  "rev_others",
  "refunded_value",
  "unique_customers",
  "link_clicks",
];

/** Ordem/seleção efetiva das colunas. */
export function orderedColumns(cols: string[] | null | undefined): string[] {
  const known = new Set(COLUMN_CATALOG.map((c) => c.key));
  if (!cols || cols.length === 0) return DEFAULT_COLUMNS;
  return cols.filter((k) => known.has(k));
}
