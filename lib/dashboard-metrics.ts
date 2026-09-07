/** Catálogo de métricas (cartões) do Dashboard do Perpétuo + base do Construtor
 *  de Métricas personalizadas. Fonte única compartilhada entre o Dashboard, o
 *  configurador de métricas e o construtor de fórmulas. */
import type { CentralSummary, ProductBreakdown, PaymentBreakdown } from "./central";
import { brl, inteiro, pct, mult } from "./format";

// ---------------------------------------------------------------------------
// Cartões pré-prontos (Fase 1) — o que aparece no configurador "Configurar métricas".
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Blocos de conteúdo do Dashboard (abaixo dos cards) — selecionáveis/ordenáveis.
// ---------------------------------------------------------------------------
export interface BlockDef {
  key: string;
  label: string;
}

export const BLOCK_CATALOG: BlockDef[] = [
  { key: "revenue_by_role", label: "Faturamento por etapa" },
  { key: "products", label: "Vendas por produto e pagamento" },
  { key: "funnel", label: "Métricas do funil" },
  { key: "ascension", label: "Ascensão" },
  { key: "timeseries", label: "Evolução diária" },
  { key: "refund", label: "Detalhes de reembolso" },
];

export const BLOCK_LABEL: Record<string, string> = Object.fromEntries(
  BLOCK_CATALOG.map((b) => [b.key, b.label]),
);

/** Ordem/seleção efetiva dos blocos: usa a config salva; se vazia, todos na ordem do catálogo. */
export function orderedBlocks(blocks: string[] | null | undefined): string[] {
  const all = BLOCK_CATALOG.map((b) => b.key);
  if (!blocks || blocks.length === 0) return all;
  const known = new Set(all);
  return blocks.filter((k) => known.has(k));
}

// ---------------------------------------------------------------------------
// Construtor de métricas — CATÁLOGO DE DADOS (átomos + derivados).
// Cada campo tem um NOME AMIGÁVEL (o usuário nunca vê a chave técnica).
// ---------------------------------------------------------------------------
export type FieldFormat = "number" | "money" | "percent" | "multiplier";

export interface FieldDef {
  key: string;
  label: string;
  group: string;
  /** Formato sugerido quando o campo é usado sozinho. */
  format: FieldFormat;
  /** Derivado = já é um cálculo pronto (atalho). */
  derived?: boolean;
}

/** Ordem em que os grupos aparecem no seletor. */
export const FIELD_GROUPS = [
  "Meta — Investimento & tráfego",
  "Meta — Vídeo",
  "Vendas (Hotmart)",
  "Reembolso",
  "Faturamento por etapa",
  "Nº de vendas por etapa",
  "Por produto",
  "Forma de pagamento",
  "Funil (rastreio)",
  "Ascensão",
  "Derivados (prontos)",
] as const;

/** Nomes amigáveis das formas de pagamento da Hotmart. */
export const PAYMENT_LABELS: Record<string, string> = {
  CREDIT_CARD: "Cartão de crédito",
  PIX: "Pix",
  APPLE_PAY: "Apple Pay",
  GOOGLE_PAY: "Google Pay",
  BILLET: "Boleto",
  PAYPAL: "PayPal",
  DEBIT_CARD: "Cartão de débito",
  HYBRID: "Híbrido",
  HOTCARD: "Hotcard",
  DIRECT_DEBIT: "Débito direto",
  WALLET: "Carteira",
  SAMSUNG_PAY: "Samsung Pay",
  PICPAY: "PicPay",
  OUTROS: "Outros",
};

export function paymentLabel(type: string): string {
  return PAYMENT_LABELS[type] ?? type;
}

export const FIELD_CATALOG: FieldDef[] = [
  // Meta — investimento & tráfego
  { key: "invested", label: "Investido", group: "Meta — Investimento & tráfego", format: "money" },
  { key: "impressions", label: "Impressões", group: "Meta — Investimento & tráfego", format: "number" },
  { key: "link_clicks", label: "Cliques no link", group: "Meta — Investimento & tráfego", format: "number" },
  { key: "lpv", label: "Visualizações da página de destino", group: "Meta — Investimento & tráfego", format: "number" },
  { key: "ic", label: "Finalizações de compra iniciadas", group: "Meta — Investimento & tráfego", format: "number" },
  { key: "purchases", label: "Compras (Meta)", group: "Meta — Investimento & tráfego", format: "number" },
  { key: "leads", label: "Leads captados", group: "Meta — Investimento & tráfego", format: "number" },
  { key: "follows", label: "Seguidores", group: "Meta — Investimento & tráfego", format: "number" },

  // Meta — vídeo
  { key: "video_plays", label: "Reproduções do vídeo", group: "Meta — Vídeo", format: "number" },
  { key: "video_3s", label: "Reproduções de 3 segundos", group: "Meta — Vídeo", format: "number" },
  { key: "video_p25", label: "Reproduções a 25%", group: "Meta — Vídeo", format: "number" },
  { key: "video_p50", label: "Reproduções a 50%", group: "Meta — Vídeo", format: "number" },
  { key: "video_p75", label: "Reproduções a 75%", group: "Meta — Vídeo", format: "number" },
  { key: "video_p95", label: "Reproduções a 95%", group: "Meta — Vídeo", format: "number" },
  { key: "video_p100", label: "Reproduções a 100%", group: "Meta — Vídeo", format: "number" },

  // Vendas (Hotmart)
  { key: "gross_revenue", label: "Faturamento bruto", group: "Vendas (Hotmart)", format: "money" },
  { key: "net_revenue", label: "Faturamento líquido", group: "Vendas (Hotmart)", format: "money" },
  { key: "refunded", label: "Valor estornado", group: "Vendas (Hotmart)", format: "money" },
  { key: "net_sales", label: "Nº de vendas (total)", group: "Vendas (Hotmart)", format: "number" },
  { key: "net_sales_principal", label: "Nº de vendas (principal)", group: "Vendas (Hotmart)", format: "number" },
  { key: "paid_count", label: "Pedidos pagos", group: "Vendas (Hotmart)", format: "number" },

  // Reembolso
  { key: "refunded_count", label: "Compras reembolsadas", group: "Reembolso", format: "number" },
  { key: "refunded_value", label: "Valor reembolsado", group: "Reembolso", format: "money" },
  { key: "chargeback_count", label: "Compras com chargeback", group: "Reembolso", format: "number" },
  { key: "chargeback_value", label: "Valor de chargeback", group: "Reembolso", format: "money" },
  { key: "canceled_count", label: "Compras canceladas", group: "Reembolso", format: "number" },
  { key: "canceled_value", label: "Valor cancelado", group: "Reembolso", format: "money" },
  { key: "refunds_total_count", label: "Total de reembolsos (compras)", group: "Reembolso", format: "number" },
  { key: "refunds_total_value", label: "Total estornado (valor)", group: "Reembolso", format: "money" },

  // Faturamento por etapa (papel)
  { key: "role_rev_principal", label: "Faturamento — Principal", group: "Faturamento por etapa", format: "money" },
  { key: "role_rev_order_bump", label: "Faturamento — Order bump", group: "Faturamento por etapa", format: "money" },
  { key: "role_rev_upsell", label: "Faturamento — Upsell", group: "Faturamento por etapa", format: "money" },
  { key: "role_rev_downsell", label: "Faturamento — Downsell", group: "Faturamento por etapa", format: "money" },
  { key: "role_rev_other", label: "Faturamento — Outros", group: "Faturamento por etapa", format: "money" },

  // Nº de vendas por etapa
  { key: "role_sales_principal", label: "Nº de vendas — Principal", group: "Nº de vendas por etapa", format: "number" },
  { key: "role_sales_order_bump", label: "Nº de vendas — Order bump", group: "Nº de vendas por etapa", format: "number" },
  { key: "role_sales_upsell", label: "Nº de vendas — Upsell", group: "Nº de vendas por etapa", format: "number" },
  { key: "role_sales_downsell", label: "Nº de vendas — Downsell", group: "Nº de vendas por etapa", format: "number" },
  { key: "role_sales_other", label: "Nº de vendas — Outros", group: "Nº de vendas por etapa", format: "number" },

  // Funil (rastreio)
  { key: "pageviews", label: "Page views", group: "Funil (rastreio)", format: "number" },
  { key: "checkouts", label: "Checkouts iniciados (rastreio)", group: "Funil (rastreio)", format: "number" },

  // Derivados prontos
  { key: "profit", label: "Lucro", group: "Derivados (prontos)", format: "money", derived: true },
  { key: "roas", label: "ROAS", group: "Derivados (prontos)", format: "multiplier", derived: true },
  { key: "ticket_medio", label: "Ticket médio", group: "Derivados (prontos)", format: "money", derived: true },
  { key: "cac_total", label: "Custo por venda (total)", group: "Derivados (prontos)", format: "money", derived: true },
  { key: "cac_principal", label: "Custo por venda (principal)", group: "Derivados (prontos)", format: "money", derived: true },
  { key: "refund_rate_count", label: "Taxa de reembolso (pedidos)", group: "Derivados (prontos)", format: "percent", derived: true },
  { key: "refund_rate_value", label: "Taxa de reembolso (valor)", group: "Derivados (prontos)", format: "percent", derived: true },
  { key: "connect_rate", label: "Connect rate", group: "Derivados (prontos)", format: "percent", derived: true },
  { key: "to_checkout", label: "Ida ao checkout", group: "Derivados (prontos)", format: "percent", derived: true },
  { key: "checkout_conv", label: "Conversão do checkout (front)", group: "Derivados (prontos)", format: "percent", derived: true },
  { key: "funnel_conv", label: "Conversão do funil (front)", group: "Derivados (prontos)", format: "percent", derived: true },

  // Ascensão (sempre sobre o nº de vendas do front)
  { key: "ascension_rate", label: "Taxa de ascensão", group: "Ascensão", format: "percent", derived: true },
  { key: "ascension_order_bump", label: "Taxa de compra — Order bump", group: "Ascensão", format: "percent", derived: true },
  { key: "ascension_upsell", label: "Taxa de compra — Upsell", group: "Ascensão", format: "percent", derived: true },
  { key: "ascension_downsell", label: "Taxa de compra — Downsell", group: "Ascensão", format: "percent", derived: true },
];

/** Campos DINÂMICOS por projeto: faturamento + nº de vendas de cada PRODUTO. */
export function productFields(byProduct: ProductBreakdown[] | null | undefined): FieldDef[] {
  const out: FieldDef[] = [];
  for (const p of byProduct ?? []) {
    if (!p.product_id) continue;
    const nome = p.name || p.product_id;
    out.push(
      { key: `prod_rev_${p.product_id}`, label: `Faturamento — ${nome}`, group: "Por produto", format: "money" },
      { key: `prod_sales_${p.product_id}`, label: `Nº de vendas — ${nome}`, group: "Por produto", format: "number" },
    );
  }
  return out;
}

/** Campos DINÂMICOS por forma de pagamento: faturamento + nº de vendas. */
export function paymentFields(byPayment: PaymentBreakdown[] | null | undefined): FieldDef[] {
  const out: FieldDef[] = [];
  for (const p of byPayment ?? []) {
    if (!p.type) continue;
    const nome = paymentLabel(p.type);
    out.push(
      { key: `pay_rev_${p.type}`, label: `Faturamento — ${nome}`, group: "Forma de pagamento", format: "money" },
      { key: `pay_sales_${p.type}`, label: `Nº de vendas — ${nome}`, group: "Forma de pagamento", format: "number" },
    );
  }
  return out;
}

/** Catálogo completo para o construtor: fixos + dinâmicos (produtos + pagamento do projeto). */
export function allFields(
  byProduct: ProductBreakdown[] | null | undefined,
  byPayment?: PaymentBreakdown[] | null | undefined,
): FieldDef[] {
  return [...FIELD_CATALOG, ...productFields(byProduct), ...paymentFields(byPayment)];
}

/** Resolve o valor numérico de um campo a partir do summary. null = sem dado. */
export function resolveField(s: CentralSummary, key: string): number | null {
  switch (key) {
    case "invested": return s.invested;
    case "impressions": return s.meta.impressions;
    case "link_clicks": return s.meta.link_clicks;
    case "lpv": return s.meta.lpv;
    case "ic": return s.meta.ic;
    case "purchases": return s.meta.purchases;
    case "leads": return s.meta.leads;
    case "follows": return s.meta.follows;
    case "video_plays": return s.meta.video_plays;
    case "video_3s": return s.meta.video_3s;
    case "video_p25": return s.meta.video_p25;
    case "video_p50": return s.meta.video_p50;
    case "video_p75": return s.meta.video_p75;
    case "video_p95": return s.meta.video_p95;
    case "video_p100": return s.meta.video_p100;
    case "gross_revenue": return s.gross_revenue;
    case "net_revenue": return s.net_revenue;
    case "refunded": return s.refunded;
    case "net_sales": return s.net_sales;
    case "net_sales_principal": return s.net_sales_principal;
    case "paid_count": return s.paid_count;
    case "reverted_count": return s.reverted_count;
    case "pageviews": return s.pageviews;
    case "checkouts": return s.checkouts;
    case "profit": return s.profit;
    case "roas": return s.roas;
    case "ticket_medio": return s.ticket_medio;
    case "cac_total": return s.cac_total;
    case "cac_principal": return s.cac_principal;
    case "refund_rate_count": return s.refund_rate_count;
    case "refund_rate_value": return s.refund_rate_value;
    case "connect_rate": return s.funnel.connect_rate;
    case "to_checkout": return s.funnel.to_checkout;
    case "checkout_conv": return s.funnel.checkout_conv;
    case "funnel_conv": return s.funnel.funnel_conv;
    // ascensão (sempre sobre o nº de vendas do front = net_sales_principal)
    case "ascension_rate": {
      const front = s.net_sales_principal;
      if (front <= 0) return null;
      const asc = (s.sales_by_role.order_bump ?? 0) + (s.sales_by_role.upsell ?? 0) + (s.sales_by_role.downsell ?? 0);
      return asc / front;
    }
    case "ascension_order_bump": return s.net_sales_principal > 0 ? (s.sales_by_role.order_bump ?? 0) / s.net_sales_principal : null;
    case "ascension_upsell": return s.net_sales_principal > 0 ? (s.sales_by_role.upsell ?? 0) / s.net_sales_principal : null;
    case "ascension_downsell": return s.net_sales_principal > 0 ? (s.sales_by_role.downsell ?? 0) / s.net_sales_principal : null;
    // reembolso (quebra por status)
    case "refunded_count": return s.refunds.refunded.count;
    case "refunded_value": return s.refunds.refunded.value;
    case "chargeback_count": return s.refunds.chargeback.count;
    case "chargeback_value": return s.refunds.chargeback.value;
    case "canceled_count": return s.refunds.canceled.count;
    case "canceled_value": return s.refunds.canceled.value;
    case "refunds_total_count": return s.refunds.refunded.count + s.refunds.chargeback.count + s.refunds.canceled.count;
    case "refunds_total_value": return s.refunded;
  }
  if (key.startsWith("role_rev_")) return s.revenue_by_role[key.slice(9)] ?? 0;
  if (key.startsWith("role_sales_")) return s.sales_by_role[key.slice(11)] ?? 0;
  if (key.startsWith("prod_rev_")) {
    const pid = key.slice(9);
    return s.by_product.find((p) => p.product_id === pid)?.net_revenue ?? 0;
  }
  if (key.startsWith("prod_sales_")) {
    const pid = key.slice(11);
    return s.by_product.find((p) => p.product_id === pid)?.net_sales ?? 0;
  }
  if (key.startsWith("pay_rev_")) {
    const t = key.slice(8);
    return s.by_payment.find((p) => p.type === t)?.net_revenue ?? 0;
  }
  if (key.startsWith("pay_sales_")) {
    const t = key.slice(10);
    return s.by_payment.find((p) => p.type === t)?.net_sales ?? 0;
  }
  return null;
}

/** Rótulo amigável de um campo (inclui produtos dinâmicos). */
export function fieldLabel(key: string, byProduct?: ProductBreakdown[] | null): string {
  const fixed = FIELD_CATALOG.find((f) => f.key === key);
  if (fixed) return fixed.label;
  const dyn = productFields(byProduct).find((f) => f.key === key);
  return dyn?.label ?? key;
}

// ---------------------------------------------------------------------------
// Métricas personalizadas — modelo, avaliador e formatação.
// ---------------------------------------------------------------------------
export type FormulaToken =
  | { kind: "field"; key: string }
  | { kind: "num"; value: number }
  | { kind: "op"; op: "+" | "-" | "*" | "/" }
  | { kind: "lp" }
  | { kind: "rp" };

export interface CustomMetric {
  /** id estável (ex.: "custom_ab12"). Prefixo `custom_` distingue de campos-base. */
  id: string;
  name: string;
  format: FieldFormat;
  formula: FormulaToken[];
}

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

/**
 * Avalia a fórmula (shunting-yard → RPN) usando um resolvedor de campo.
 * Sem `eval`. Propaga null (campo sem dado, divisão por zero, fórmula inválida).
 */
export function evalTokens(
  formula: FormulaToken[],
  getValue: (key: string) => number | null,
): number | null {
  if (!formula || formula.length === 0) return null;
  const output: Array<{ v: number | null }> = [];
  const ops: string[] = [];
  const apply = () => {
    const op = ops.pop()!;
    const b = output.pop();
    const a = output.pop();
    if (!a || !b) return false;
    if (a.v == null || b.v == null) { output.push({ v: null }); return true; }
    let r: number | null;
    switch (op) {
      case "+": r = a.v + b.v; break;
      case "-": r = a.v - b.v; break;
      case "*": r = a.v * b.v; break;
      case "/": r = b.v === 0 ? null : a.v / b.v; break;
      default: r = null;
    }
    output.push({ v: r });
    return true;
  };
  try {
    for (const t of formula) {
      if (t.kind === "field") output.push({ v: getValue(t.key) });
      else if (t.kind === "num") output.push({ v: t.value });
      else if (t.kind === "op") {
        while (ops.length && ops[ops.length - 1] !== "(" && PREC[ops[ops.length - 1]] >= PREC[t.op]) {
          if (!apply()) return null;
        }
        ops.push(t.op);
      } else if (t.kind === "lp") ops.push("(");
      else if (t.kind === "rp") {
        while (ops.length && ops[ops.length - 1] !== "(") if (!apply()) return null;
        if (ops[ops.length - 1] === "(") ops.pop();
        else return null; // parêntese desbalanceado
      }
    }
    while (ops.length) {
      if (ops[ops.length - 1] === "(") return null;
      if (!apply()) return null;
    }
    if (output.length !== 1) return null;
    const v = output[0].v;
    return v == null || !isFinite(v) ? null : v;
  } catch {
    return null;
  }
}

/** Avalia a fórmula sobre os valores do summary. */
export function evalFormula(formula: FormulaToken[], s: CentralSummary): number | null {
  return evalTokens(formula, (k) => resolveField(s, k));
}

/** Formata um valor conforme o formato escolhido. null -> "—". */
export function formatValue(value: number | null, format: FieldFormat): string {
  if (value == null) return "—";
  switch (format) {
    case "money": return brl(value);
    case "percent": return pct(value);
    case "multiplier": return mult(value);
    default: return inteiro(value);
  }
}
