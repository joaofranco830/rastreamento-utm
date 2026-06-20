import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrigem } from "@/lib/origem";
import { resolveRange } from "@/lib/central";
import { brl, inteiro, pct } from "@/lib/format";
import Nav from "../nav";
import DateFilter from "../central/date-filter";
import CustomersTable from "./customers-table";
import { classLabel } from "./labels";

export const dynamic = "force-dynamic";

export default async function OrigemPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; dias?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const { from, to, dias } = resolveRange(sp);
  const { overview: ov, customers } = await getOrigem(from, to);
  const total = ov.total.sales || 0;
  const shareOf = (n: number) => (total > 0 ? n / total : 0);
  const qs = `?from=${from}&to=${to}`;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
      <Nav active="/origem" qs={qs} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {from} a {to} · {inteiro(ov.total.sales)} vendas no escopo
        </p>
        <DateFilter from={from} to={to} dias={dias} />
      </div>

      {/* Rastreadas vs não rastreadas */}
      <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.12]">
          <p className="text-xs text-zinc-500">Total de vendas</p>
          <p className="mt-1 text-xl font-semibold">{inteiro(ov.total.sales)}</p>
          <p className="mt-0.5 text-xs text-zinc-400">{brl(ov.total.net_revenue)}</p>
        </div>
        <div className="rounded-xl border border-emerald-300/40 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <p className="text-xs text-zinc-500">Rastreadas</p>
          <p className="mt-1 text-xl font-semibold">
            {inteiro(ov.tracked.sales)} <span className="text-sm font-normal text-zinc-400">({pct(shareOf(ov.tracked.sales))})</span>
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">{brl(ov.tracked.net_revenue)}</p>
        </div>
        <div className="rounded-xl border border-amber-300/40 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-xs text-zinc-500">Não rastreadas</p>
          <p className="mt-1 text-xl font-semibold">
            {inteiro(ov.untracked.sales)} <span className="text-sm font-normal text-zinc-400">({pct(shareOf(ov.untracked.sales))})</span>
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">{brl(ov.untracked.net_revenue)}</p>
        </div>
      </section>

      {/* Por classe de origem */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-zinc-500">Por origem</h2>
        <div className="overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.12]">
          <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
            {ov.by_class.map((r) => (
              <li key={r.class} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{classLabel(r.class)}</span>
                <span className="flex items-center gap-4 text-zinc-500">
                  <span className="tabular-nums">{inteiro(r.sales)} vendas</span>
                  <span className="tabular-nums">{brl(r.net_revenue)}</span>
                  <span className="w-12 text-right tabular-nums text-zinc-400">{pct(shareOf(r.sales))}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Por source/medium */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-zinc-500">Por source / medium</h2>
        <div className="overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.12]">
          <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-3 border-b border-black/[.06] bg-black/[.02] px-4 py-2 text-xs text-zinc-500 dark:border-white/[.08] dark:bg-white/[.03]">
            <span>Source</span>
            <span>Medium</span>
            <span className="text-right">Vendas</span>
            <span className="text-right">Faturamento</span>
          </div>
          <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
            {ov.by_source_medium.map((r, i) => (
              <li key={`${r.source}-${r.medium}-${i}`} className="grid grid-cols-[1fr_1fr_auto_auto] gap-3 px-4 py-2.5 text-sm">
                <span className="truncate">{r.source}</span>
                <span className="truncate text-zinc-500">{r.medium}</span>
                <span className="text-right tabular-nums">{inteiro(r.sales)}</span>
                <span className="text-right tabular-nums">{brl(r.net_revenue)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Clientes */}
      <section className="mb-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-500">Clientes (por e-mail) — clique para o histórico</h2>
        <CustomersTable customers={customers} />
      </section>
    </main>
  );
}
