import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/dashboard";
import { brl, inteiro, pct, mult } from "@/lib/format";
import LogoutButton from "./logout-button";
import RefreshButton from "./refresh-button";

export const dynamic = "force-dynamic"; // dados sempre frescos

const PERIODOS = [7, 14, 30, 90];

function freshness(iso: string | null): string {
  if (!iso) return "nunca sincronizado";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { dias } = await searchParams;
  const d = await getDashboardData(dias);
  const s = d.summary;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
      {/* Cabeçalho */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rastreamento UTM</h1>
          <p className="text-sm text-zinc-500">
            Período {d.from} a {d.to} · Meta atualizado {freshness(d.lastSyncAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RefreshButton />
          <LogoutButton />
        </div>
      </header>

      {/* Seletor de período */}
      <nav className="mb-6 flex gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p}
            href={`/?dias=${p}`}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              d.dias === p
                ? "border-transparent bg-foreground text-background"
                : "border-black/[.12] hover:bg-black/[.04] dark:border-white/[.2] dark:hover:bg-white/[.06]"
            }`}
          >
            {p} dias
          </Link>
        ))}
      </nav>

      {!s ? (
        <p className="text-sm text-zinc-500">Sem dados para o período.</p>
      ) : (
        <div className="space-y-8">
          {/* Cartões-cabeça */}
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card title="Investido (Meta)" value={brl(s.invested)} />
            <Card title="Vendas líquidas" value={inteiro(s.net_sales)} hint={`${inteiro(s.paid_count)} pagas − ${inteiro(s.reverted_count)} revertidas`} />
            <Card title="Faturamento líquido" value={brl(s.net_revenue)} hint={`bruto ${brl(s.gross_revenue)}`} />
            <Card title="ROAS" value={mult(s.roas)} hint="faturamento líq. ÷ investido" accent />
          </section>

          {/* Funil */}
          <Section title="Funil">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Mini title="Connect rate" value={pct(s.funnel.connect_rate)} hint="pageviews ÷ cliques (Meta)" />
              <Mini title="Ida ao checkout" value={pct(s.funnel.to_checkout)} hint="checkout ÷ pageviews" />
              <Mini title="Conv. checkout" value={pct(s.funnel.checkout_conv)} hint="vendas ÷ checkout" />
              <Mini title="Conv. funil" value={pct(s.funnel.funnel_conv)} hint="vendas ÷ pageviews" />
            </div>
            {s.pageviews === 0 && (
              <p className="mt-3 text-xs text-amber-600">
                Sem pageviews no período — instale o t.js no funil para preencher o funil do nosso rastreio.
              </p>
            )}
          </Section>

          {/* Reembolso */}
          <Section title="Reembolso">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <Mini title="Taxa (contagem)" value={pct(s.refund_rate_count)} hint="revertidas ÷ pagas" />
              <Mini title="Taxa (valor)" value={pct(s.refund_rate_value)} hint="estornado ÷ bruto" />
              <Mini title="Valor estornado" value={brl(s.refunded)} />
            </div>
          </Section>

          {/* Reconciliação Meta × nosso */}
          <Section title="Reconciliação — Meta × nosso rastreio">
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500">
                <tr className="border-b border-black/[.08] dark:border-white/[.1]">
                  <th className="py-2 font-medium">Métrica</th>
                  <th className="py-2 text-right font-medium">Meta</th>
                  <th className="py-2 text-right font-medium">Nosso</th>
                </tr>
              </thead>
              <tbody>
                <ReconRow label="Landing page views / pageviews" meta={s.meta.lpv} nosso={s.pageviews} />
                <ReconRow label="Checkouts iniciados" meta={s.meta.ic} nosso={s.checkouts} />
                <ReconRow label="Compras" meta={s.meta.purchases} nosso={s.net_sales} />
              </tbody>
            </table>
            <p className="mt-2 text-xs text-zinc-400">
              Diferenças são esperadas (ad-block, cookie perdido, atraso de webhook). A venda/faturamento de verdade é sempre o nosso (Hotmart).
            </p>
          </Section>

          {/* Por campanha */}
          <Section title="Por campanha">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-zinc-500">
                  <tr className="border-b border-black/[.08] dark:border-white/[.1]">
                    <th className="py-2 font-medium">Campanha</th>
                    <th className="py-2 text-right font-medium">Investido</th>
                    <th className="py-2 text-right font-medium">Fat. líquido</th>
                    <th className="py-2 text-right font-medium">Vendas líq.</th>
                    <th className="py-2 text-right font-medium">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {d.campaigns.length === 0 ? (
                    <tr><td colSpan={5} className="py-3 text-zinc-500">Sem dados.</td></tr>
                  ) : (
                    d.campaigns.map((c, i) => (
                      <tr key={i} className="border-b border-black/[.04] dark:border-white/[.06]">
                        <td className="max-w-xs truncate py-2">{c.campaign ?? "—"}</td>
                        <td className="py-2 text-right">{brl(c.invested)}</td>
                        <td className="py-2 text-right">{brl(c.net_revenue)}</td>
                        <td className="py-2 text-right">{inteiro(c.net_sales)}</td>
                        <td className="py-2 text-right">{mult(c.roas)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              O faturamento por campanha aparece quando houver vendas rastreadas (visitor_id → anúncio). Até lá, as vendas ficam em &quot;Sem atribuição&quot;.
            </p>
          </Section>
        </div>
      )}
    </main>
  );
}

function Card({ title, value, hint, accent }: { title: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-transparent bg-foreground text-background" : "border-black/[.08] bg-white dark:border-white/[.145] dark:bg-zinc-950"}`}>
      <p className={`text-xs ${accent ? "opacity-80" : "text-zinc-500"}`}>{title}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className={`mt-1 text-xs ${accent ? "opacity-70" : "text-zinc-400"}`}>{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950">
      <h2 className="mb-4 text-sm font-semibold text-zinc-600 dark:text-zinc-300">{title}</h2>
      {children}
    </section>
  );
}

function Mini({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}

function ReconRow({ label, meta, nosso }: { label: string; meta: number; nosso: number }) {
  return (
    <tr className="border-b border-black/[.04] dark:border-white/[.06]">
      <td className="py-2">{label}</td>
      <td className="py-2 text-right">{inteiro(meta)}</td>
      <td className="py-2 text-right">{inteiro(nosso)}</td>
    </tr>
  );
}
