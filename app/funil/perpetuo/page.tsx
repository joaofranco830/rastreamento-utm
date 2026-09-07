import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { getPerpetuoFunnel } from "@/lib/funnel";
import { getCentral, resolveRange } from "@/lib/central";
import { brl, inteiro, pct, mult } from "@/lib/format";
import TimeseriesChart from "../../central/timeseries-chart";
import DateButton from "./date-button";
import MetricsConfig from "./metrics-config";
import SalesTables from "./sales-tables";
import {
  METRIC_CATALOG,
  allFields,
  resolveField,
  evalFormula,
  formatValue,
  orderedBlocks,
} from "@/lib/dashboard-metrics";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  principal: "Principal",
  order_bump: "Order bump",
  upsell: "Upsell",
  downsell: "Downsell",
  other: "Outros",
};
const ROLE_ORDER = ["principal", "order_bump", "upsell", "downsell", "other"];

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/[.1] bg-[var(--noite-2)] p-4">
      <p className="font-mono text-[11px] uppercase tracking-wider text-aco">{label}</p>
      <p className="font-display mt-2 text-2xl text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

function FunnelStep({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex-1 rounded-xl border border-white/[.1] bg-[var(--noite-2)] p-4 text-center">
      <p className="font-display text-3xl text-lima">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-zinc-400">{hint}</p>}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; dias?: string }>;
}) {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/configuracoes");

  const sp = await searchParams;
  const { from, to } = resolveRange(sp);
  // A seleção de contas fica no funil (Configurar funil). Precisamos dela antes de
  // ler os números, então resolvemos o funil primeiro.
  const funnel = await getPerpetuoFunnel(projectId);
  const d = await getCentral(projectId, from, to, funnel?.source_filters?.ad_accounts ?? null);
  const s = d.summary;
  const roleTotal = ROLE_ORDER.reduce((acc, r) => acc + (s.revenue_by_role[r] ?? 0), 0);

  // Métricas configuráveis (cartões) — renderiza na ORDEM salva.
  const cfg = funnel?.dashboard_config ?? null;
  const customs = cfg?.custom_metrics ?? [];
  const nodeOf: Record<string, React.ReactNode> = {
    invested: <Card label="Investido" value={brl(s.invested)} />,
    net_revenue: <Card label="Faturamento (líq.)" value={brl(s.net_revenue)} />,
    profit: <Card label="Lucro" value={brl(s.profit)} />,
    roas: <Card label="ROAS" value={mult(s.roas)} />,
    ticket_medio: <Card label="Ticket médio" value={brl(s.ticket_medio)} />,
    cac_total: <Card label="Custo/venda (total)" value={brl(s.cac_total)} />,
    cac_principal: <Card label="Custo/venda (principal)" value={brl(s.cac_principal)} />,
    refund_rate: <Card label="Taxa de reembolso" value={pct(s.refund_rate_count)} sub={`${pct(s.refund_rate_value)} do valor`} />,
    net_sales: <Card label="Nº vendas (total)" value={inteiro(s.net_sales)} />,
    net_sales_principal: <Card label="Nº vendas (principal)" value={inteiro(s.net_sales_principal)} />,
  };
  // Cartões de métricas personalizadas (fórmulas) — computados a partir do summary.
  for (const cm of customs) {
    nodeOf[cm.id] = <Card label={cm.name} value={formatValue(evalFormula(cm.formula, s), cm.format)} />;
  }

  // Catálogo de dados + valores atuais (para o construtor de fórmulas mostrar prévia).
  const fields = allFields(s.by_product, s.by_payment);
  const values: Record<string, number | null> = {};
  for (const f of fields) values[f.key] = resolveField(s, f.key);

  // Ordem efetiva: usa a config salva (aceita ids custom_*); sem config = catálogo base.
  const known = new Set(Object.keys(nodeOf));
  const order =
    cfg?.cards && cfg.cards.length > 0
      ? cfg.cards.filter((k) => known.has(k))
      : METRIC_CATALOG.map((m) => m.key);
  const visibleCards = order.map((key) => ({ key, node: nodeOf[key] })).filter((c) => c.node);

  // Reembolso por produto (só produtos com algum estorno no período).
  const refundRows = s.by_product.filter((p) => p.refund_count > 0 || p.refunded_value > 0);
  const totalRefunded = s.refunded;

  // Blocos de conteúdo (abaixo dos cards) — renderizados na ORDEM salva.
  const blockOf: Record<string, React.ReactNode> = {
    revenue_by_role: (
      <section className="mb-8">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-aco">Faturamento por etapa</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ROLE_ORDER.map((r) => {
            const v = s.revenue_by_role[r] ?? 0;
            const share = roleTotal > 0 ? v / roleTotal : 0;
            return (
              <div key={r} className="rounded-xl border border-white/[.1] bg-[var(--noite-2)] p-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-aco">{ROLE_LABELS[r]}</p>
                <p className="font-display mt-2 text-lg text-foreground">{brl(v)}</p>
                <p className="mt-0.5 text-xs text-zinc-400">{pct(share)}</p>
              </div>
            );
          })}
        </div>
      </section>
    ),
    products: (
      <section className="mb-8">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-aco">Vendas por produto e pagamento</h2>
        <SalesTables products={s.by_product} payments={s.by_payment} />
      </section>
    ),
    funnel: (
      <section className="mb-8">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-aco">Funil</h2>
        <div className="flex flex-wrap gap-3">
          <FunnelStep
            label="Connect rate"
            value={pct(s.funnel.connect_rate)}
            hint={`${inteiro(s.pageviews)} PVs${s.pageviews_source === "meta" ? " (Meta)" : ""} / ${inteiro(s.meta.link_clicks)} cliques`}
          />
          <FunnelStep
            label="Ida ao checkout"
            value={pct(s.funnel.to_checkout)}
            hint={`${inteiro(s.checkouts)} checkouts${s.checkouts_source === "meta" ? " (Meta)" : ""}`}
          />
          <FunnelStep label="Conv. checkout" value={pct(s.funnel.checkout_conv)} />
          <FunnelStep label="Conv. funil" value={pct(s.funnel.funnel_conv)} />
        </div>
        {(s.pageviews_source === "meta" || s.checkouts_source === "meta") && (
          <p className="mt-2 text-[11px] text-zinc-500">
            Sem dados do nosso pixel no período — page views/checkouts vindos do Meta (LPV / checkout iniciado).
          </p>
        )}
      </section>
    ),
    timeseries: (
      <section className="mb-8">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-aco">Evolução diária</h2>
        <div className="rounded-xl border border-white/[.1] bg-[var(--noite-2)] p-4">
          <TimeseriesChart data={d.series} />
        </div>
      </section>
    ),
    refund: (
      <section className="mb-4">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-aco">Reembolsos</h2>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Card label="Compras reembolsadas" value={inteiro(s.refunds.refunded.count)} sub={brl(s.refunds.refunded.value)} />
          <Card label="Compras com chargeback" value={inteiro(s.refunds.chargeback.count)} sub={brl(s.refunds.chargeback.value)} />
          <Card label="Compras canceladas" value={inteiro(s.refunds.canceled.count)} sub={brl(s.refunds.canceled.value)} />
          <Card label="Total estornado" value={brl(s.refunded)} sub={`de ${inteiro(s.paid_count)} pagos`} />
          <Card label="Taxa (compras)" value={pct(s.refund_rate_count)} />
          <Card label="Taxa (valor)" value={pct(s.refund_rate_value)} />
        </div>
        {refundRows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-white/[.1] bg-[var(--noite-2)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-aco">
                  <th className="px-3 py-2 font-normal">Produto</th>
                  <th className="px-3 py-2 text-right font-normal">Reembolsos</th>
                  <th className="px-3 py-2 text-right font-normal">% da etapa</th>
                  <th className="px-3 py-2 text-right font-normal">Valor estornado</th>
                  <th className="px-3 py-2 text-right font-normal">% do estorno</th>
                </tr>
              </thead>
              <tbody>
                {refundRows.map((r) => (
                  <tr key={r.product_id} className="border-t border-white/[.06]">
                    <td className="px-3 py-2 text-foreground">{r.name}</td>
                    <td className="px-3 py-2 text-right text-foreground">{inteiro(r.refund_count)}</td>
                    <td className="px-3 py-2 text-right text-zinc-400">{pct(r.paid > 0 ? r.refund_count / r.paid : 0)}</td>
                    <td className="px-3 py-2 text-right font-display text-foreground">{brl(r.refunded_value)}</td>
                    <td className="px-3 py-2 text-right text-zinc-400">{pct(totalRefunded > 0 ? r.refunded_value / totalRefunded : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    ),
  };
  const visibleBlocks = orderedBlocks(cfg?.blocks ?? null)
    .map((key) => ({ key, node: blockOf[key] }))
    .filter((b) => b.node);

  return (
    <>
      {/* Controles desta aba: configurar métricas + período. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg text-foreground">DASHBOARD GERAL</h2>
        <div className="flex flex-wrap items-center gap-2">
          <MetricsConfig
            current={cfg?.cards ?? null}
            presets={cfg?.presets ?? []}
            customMetrics={customs}
            fields={fields}
            values={values}
            blocks={cfg?.blocks ?? null}
          />
          <DateButton />
        </div>
      </div>

      {visibleCards.length > 0 && (
        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visibleCards.map((c) => (
            <div key={c.key}>{c.node}</div>
          ))}
        </section>
      )}

      {visibleBlocks.map((b) => (
        <div key={b.key}>{b.node}</div>
      ))}
    </>
  );
}
