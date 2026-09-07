/** Catálogo de métricas (cartões) do Dashboard do Perpétuo.
 *  Fonte única compartilhada entre o Dashboard e o configurador de métricas. */
export interface MetricDef {
  key: string;
  label: string;
}

export const METRIC_CATALOG: MetricDef[] = [
  { key: "invested", label: "Investido" },
  { key: "net_revenue", label: "Faturamento (líq.)" },
  { key: "profit", label: "Lucro" },
  { key: "roas", label: "ROAS" },
  { key: "ticket_medio", label: "Ticket médio" },
  { key: "cac_total", label: "Custo/venda (total)" },
  { key: "cac_principal", label: "Custo/venda (principal)" },
  { key: "refund_rate", label: "Taxa de reembolso" },
  { key: "net_sales", label: "Nº vendas (total)" },
  { key: "net_sales_principal", label: "Nº vendas (principal)" },
];

export const METRIC_LABEL: Record<string, string> = Object.fromEntries(
  METRIC_CATALOG.map((m) => [m.key, m.label]),
);

/** Ordem/seleção efetiva: usa a config salva; se vazia, todas na ordem do catálogo. */
export function orderedActiveMetrics(cards: string[] | null | undefined): string[] {
  const all = METRIC_CATALOG.map((m) => m.key);
  if (!cards || cards.length === 0) return all;
  const known = new Set(all);
  return cards.filter((k) => known.has(k));
}
