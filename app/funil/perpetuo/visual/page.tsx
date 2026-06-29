import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { getCentral, resolveRange } from "@/lib/central";
import { inteiro, pct, brl } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function VisualPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; dias?: string }>;
}) {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/configuracoes");

  const sp = await searchParams;
  const { from, to } = resolveRange(sp);
  const d = await getCentral(projectId, from, to);
  const s = d.summary;

  const steps = [
    { label: "Cliques no link (Meta)", value: s.meta.link_clicks },
    { label: "Pageviews (nosso pixel)", value: s.pageviews },
    { label: "Checkouts iniciados", value: s.checkouts },
    { label: "Vendas (líquidas)", value: s.net_sales },
  ];
  const max = Math.max(steps[0].value, 1);

  return (
    <div className="max-w-2xl">
      <h2 className="mb-1 text-base font-medium">Funil (visual)</h2>
      <p className="mb-6 text-sm text-zinc-500">
        Etapas do funil com as métricas do período. O rastreio é parcial — vendas vêm do webhook (completo).
      </p>

      <div className="flex flex-col items-center gap-1">
        {steps.map((st, i) => {
          const width = Math.max(12, Math.min(100, (st.value / max) * 100));
          const prev = i > 0 ? steps[i - 1].value : null;
          const conv = prev && prev > 0 ? st.value / prev : null;
          return (
            <div key={st.label} className="flex w-full flex-col items-center">
              {conv !== null && (
                <span className="my-1 text-[11px] text-zinc-400">▼ {pct(conv)}</span>
              )}
              <div
                className="flex items-center justify-between rounded-xl bg-foreground px-4 py-3 text-background"
                style={{ width: `${width}%` }}
              >
                <span className="truncate text-sm font-medium">{st.label}</span>
                <span className="ml-3 shrink-0 tabular-nums">{inteiro(st.value)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.12]">
          <p className="text-xs text-zinc-500">Investido</p>
          <p className="mt-1 text-lg font-semibold">{brl(s.invested)}</p>
        </div>
        <div className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.12]">
          <p className="text-xs text-zinc-500">Faturamento (líq.)</p>
          <p className="mt-1 text-lg font-semibold">{brl(s.net_revenue)}</p>
        </div>
        <div className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.12]">
          <p className="text-xs text-zinc-500">ROAS</p>
          <p className="mt-1 text-lg font-semibold">{s.roas ? `${s.roas}x` : "—"}</p>
        </div>
        <div className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.12]">
          <p className="text-xs text-zinc-500">Conv. funil</p>
          <p className="mt-1 text-lg font-semibold">{pct(s.funnel.funnel_conv)}</p>
        </div>
      </div>
    </div>
  );
}
