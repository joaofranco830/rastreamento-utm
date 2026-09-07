import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { brl, inteiro, pct, mult } from "@/lib/format";
import LogoutButton from "../logout-button";
import RefreshButton from "../refresh-button";

export const dynamic = "force-dynamic"; // dados sempre frescos

const PERIODOS = [7, 14, 30, 90];

function metaStale(lastSyncAt: string | null, lastStatus: string | null): boolean {
  if (lastStatus === "error") return true;
  if (!lastSyncAt) return true;
  const t = new Date(lastSyncAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > 12 * 3600_000; // > 12h sem sync
}

function freshness(iso: string | null): string {
  if (!iso) return "nunca sincronizado";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "desconhecido";
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
}

export default async function DashboardV1({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Visão da conta inteira (todos os projetos somados): só o dono da conta.
  if (!(await isOwner())) redirect("/configuracoes");

  const { dias } = await searchParams;
  const d = await getDashboardData(dias);
  const s = d.summary;
  const metaProblema = metaStale(d.lastSyncAt, d.lastStatus);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
      {/* Cabeçalho */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard v1 (antigo)</h1>
          <p className="text-sm text-zinc-500">
            Visão da conta inteira (sem filtro de produto/campanha) · Período {d.from} a {d.to} · Meta {freshness(d.lastSyncAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RefreshButton />
          <Link
            href="/central"
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            ← Voltar pra V2
          </Link>
          <LogoutButton />
        </div>
      </header>

      <p className="mb-6 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30">
        Esta é a tela antiga, mantida só por referência. Ela <b>não</b> aplica os filtros de produto/campanha da V2 — mostra a conta inteira.
      </p>

      {/* Seletor de período */}
      <nav className="mb-6 flex gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p}
            href={`/v1?dias=${p}`}
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

      {metaProblema && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30">
          ⚠️ Dados do Meta podem estar desatualizados (
          {d.lastStatus === "error" ? "última sincronização falhou" : `sync ${freshness(d.lastSyncAt)}`}). O
          dashboard segue com os últimos dados salvos — clique em <b>Atualizar Meta</b> para tentar de novo.
        </div>
      )}

      {!s ? (
        <p className="text-sm text-zinc-500">Sem dados para o período.</p>
      ) : (
        <div className="space-y-8">
          {s.orders_no_date > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30">
              {inteiro(s.orders_no_date)} pedido(s) sem data de venda não entram em nenhum período (verificar payload).
            </p>
          )}
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
              <Mini title="Reembolso (pedidos)" value={pct(s.refund_rate_count)} hint="pedidos revertidos ÷ pagos" />
              <Mini title="Reembolso (% do faturamento)" value={pct(s.refund_rate_value)} hint="valor estornado ÷ bruto (inclui parciais)" />
              <Mini title="Valor estornado" value={brl(s.refunded)} />
            </div>
          </Section>

          {/* Por criativo */}
          <Section title="Por criativo">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-zinc-500">
                  <tr className="border-b border-black/[.08] dark:border-white/[.1]">
                    <th className="py-2 font-medium">Criativo</th>
                    <th className="py-2 text-right font-medium">Investido</th>
                    <th className="py-2 text-right font-medium">Fat. líquido</th>
                    <th className="py-2 text-right font-medium">Vendas líq.</th>
                    <th className="py-2 text-right font-medium">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {d.creatives.length === 0 ? (
                    <tr><td colSpan={5} className="py-3 text-zinc-500">Sem dados.</td></tr>
                  ) : (
                    d.creatives.map((c, i) => (
                      <tr key={i} className="border-b border-black/[.04] dark:border-white/[.06]">
                        <td className="max-w-xs truncate py-2">{c.creative ?? "—"}</td>
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
