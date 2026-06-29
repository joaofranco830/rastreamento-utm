import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { getPerpetuoFunnel } from "@/lib/funnel";
import { getCentral, resolveRange } from "@/lib/central";
import { brl, inteiro, pct, mult } from "@/lib/format";
import TimeseriesChart from "../../central/timeseries-chart";

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
    <div className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.12]">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

function FunnelStep({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex-1 rounded-xl border border-black/[.08] p-4 text-center dark:border-white/[.12]">
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
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
  const [d, funnel] = await Promise.all([getCentral(projectId, from, to), getPerpetuoFunnel(projectId)]);
  const s = d.summary;
  const roleTotal = ROLE_ORDER.reduce((acc, r) => acc + (s.revenue_by_role[r] ?? 0), 0);

  // Pré-definição de métricas (Configurar dashboard). null = mostrar todas.
  const enabled = funnel?.dashboard_config?.cards ?? null;
  const show = (key: string) => enabled === null || enabled.includes(key);

  const CARDS: { key: string; node: React.ReactNode }[] = [
    { key: "invested", node: <Card label="Investido" value={brl(s.invested)} /> },
    { key: "net_revenue", node: <Card label="Faturamento (líq.)" value={brl(s.net_revenue)} /> },
    { key: "profit", node: <Card label="Lucro" value={brl(s.profit)} /> },
    { key: "roas", node: <Card label="ROAS" value={mult(s.roas)} /> },
    { key: "ticket_medio", node: <Card label="Ticket médio" value={brl(s.ticket_medio)} /> },
    { key: "cac_total", node: <Card label="Custo/venda (total)" value={brl(s.cac_total)} /> },
    { key: "cac_principal", node: <Card label="Custo/venda (principal)" value={brl(s.cac_principal)} /> },
    { key: "refund_rate", node: <Card label="Taxa de reembolso" value={pct(s.refund_rate_count)} sub={`${pct(s.refund_rate_value)} do valor`} /> },
    { key: "net_sales", node: <Card label="Nº vendas (total)" value={inteiro(s.net_sales)} /> },
    { key: "net_sales_principal", node: <Card label="Nº vendas (principal)" value={inteiro(s.net_sales_principal)} /> },
  ];
  const visibleCards = CARDS.filter((c) => show(c.key));

  return (
    <>
      {visibleCards.length > 0 && (
        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visibleCards.map((c) => (
            <div key={c.key}>{c.node}</div>
          ))}
        </section>
      )}

      {/* Faturamento por papel */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-zinc-500">Faturamento por papel</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ROLE_ORDER.map((r) => {
            const v = s.revenue_by_role[r] ?? 0;
            const share = roleTotal > 0 ? v / roleTotal : 0;
            return (
              <div key={r} className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.12]">
                <p className="text-xs text-zinc-500">{ROLE_LABELS[r]}</p>
                <p className="mt-1 text-lg font-semibold tracking-tight">{brl(v)}</p>
                <p className="mt-0.5 text-xs text-zinc-400">{pct(share)}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Funil */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-zinc-500">Funil</h2>
        <div className="flex flex-wrap gap-3">
          <FunnelStep label="Connect rate" value={pct(s.funnel.connect_rate)} hint={`${inteiro(s.pageviews)} PVs / ${inteiro(s.meta.link_clicks)} cliques`} />
          <FunnelStep label="Ida ao checkout" value={pct(s.funnel.to_checkout)} hint={`${inteiro(s.checkouts)} checkouts`} />
          <FunnelStep label="Conv. checkout" value={pct(s.funnel.checkout_conv)} />
          <FunnelStep label="Conv. funil" value={pct(s.funnel.funnel_conv)} />
        </div>
      </section>

      {/* Gráfico temporal */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-zinc-500">Evolução diária</h2>
        <div className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.12]">
          <TimeseriesChart data={d.series} />
        </div>
      </section>

      {/* Reembolso */}
      <section className="mb-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-500">Reembolso</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="Pedidos revertidos" value={inteiro(s.reverted_count)} sub={`de ${inteiro(s.paid_count)} pagos`} />
          <Card label="Valor estornado" value={brl(s.refunded)} />
          <Card label="Taxa (pedidos)" value={pct(s.refund_rate_count)} />
          <Card label="Taxa (valor)" value={pct(s.refund_rate_value)} />
        </div>
      </section>
    </>
  );
}
