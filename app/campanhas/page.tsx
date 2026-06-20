import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/central";
import {
  getCampaignsTable,
  getCreativesConsolidated,
  type CampaignRow,
  type CreativeRow,
  type Level,
} from "@/lib/campanhas";
import { brl, inteiro, pct, mult } from "@/lib/format";
import Nav from "../nav";
import DateFilter from "../central/date-filter";

export const dynamic = "force-dynamic";

const n = (v: unknown): number => Number(v) || 0;
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const brlN = (x: number | null): string => (x == null ? "—" : brl(x));
const cpm = (spend: number, impr: number): number | null => (impr > 0 ? (spend / impr) * 1000 : null);

const LEVELS: { key: Level; label: string }[] = [
  { key: "campaign", label: "Campanhas" },
  { key: "adset", label: "Conjuntos" },
  { key: "creative", label: "Anúncios" },
];

function statusBadge(s: string | null) {
  const base = "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium";
  if (s === "ACTIVE") return <span className={`${base} bg-emerald-500/15 text-emerald-600 dark:text-emerald-400`}>ATIVO</span>;
  if (s === "PAUSED") return <span className={`${base} bg-zinc-500/15 text-zinc-500`}>PAUSADO</span>;
  if (!s) return <span className="text-zinc-400">—</span>;
  return <span className={`${base} bg-amber-500/15 text-amber-600 dark:text-amber-400`}>{s}</span>;
}

// Colunas (§8.3) calculadas dos agregados-base.
const COLS: { h: string; f: (r: CampaignRow) => string }[] = [
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

const CREATIVE_COLS: { h: string; f: (r: CreativeRow) => string }[] = [
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
  { h: "Hook rate", f: (r) => pct(ratio(n(r.video_3s), n(r.impressions))) },
  { h: "Retenção", f: (r) => pct(ratio(n(r.video_p75), n(r.video_plays))) },
  { h: "CTR cta", f: (r) => pct(ratio(n(r.link_clicks), n(r.video_p95))) },
  { h: "CTR", f: (r) => pct(ratio(n(r.link_clicks), n(r.impressions))) },
];

function isLevel(v: string | undefined): v is Level {
  return v === "campaign" || v === "adset" || v === "creative";
}

export default async function CampanhasPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; dias?: string; level?: string; parent?: string; pname?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const { from, to, dias } = resolveRange(sp);
  const level: Level = isLevel(sp.level) ? sp.level : "campaign";
  const parent = sp.parent ?? null;
  const pname = sp.pname ?? null;
  const qs = `?from=${from}&to=${to}`;

  const [rows, creatives] = await Promise.all([
    getCampaignsTable(level, parent, from, to),
    getCreativesConsolidated(from, to),
  ]);

  const childLevel: Level | null = level === "campaign" ? "adset" : level === "adset" ? "creative" : null;
  const drillHref = (r: CampaignRow) =>
    childLevel
      ? `/campanhas?level=${childLevel}&parent=${encodeURIComponent(r.meta_id)}&pname=${encodeURIComponent(r.name ?? "")}&from=${from}&to=${to}`
      : null;

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-8">
      <Nav active="/campanhas" qs={qs} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {LEVELS.map((l) => (
            <Link
              key={l.key}
              href={`/campanhas?level=${l.key}&from=${from}&to=${to}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                level === l.key && !parent
                  ? "bg-foreground text-background"
                  : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-300 dark:hover:bg-white/[.06]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <DateFilter from={from} to={to} dias={dias} />
      </div>

      {parent && (
        <p className="mb-3 text-sm text-zinc-500">
          {level === "adset" ? "Conjuntos" : "Anúncios"} de <b>{pname}</b>{" "}
          <Link href={`/campanhas?level=campaign&from=${from}&to=${to}`} className="ml-1 underline hover:no-underline">
            ← voltar
          </Link>
        </p>
      )}

      {/* Tabela principal (estilo gerenciador) */}
      <div className="mb-10 overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.12]">
        <table className="w-full min-w-max text-xs">
          <thead className="bg-black/[.02] text-left text-zinc-500 dark:bg-white/[.03]">
            <tr className="border-b border-black/[.06] dark:border-white/[.08]">
              <th className="sticky left-0 z-10 bg-black/[.02] px-3 py-2 font-medium dark:bg-zinc-950">Nome</th>
              <th className="px-3 py-2 font-medium">Veic.</th>
              {COLS.map((c) => (
                <th key={c.h} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                  {c.h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLS.length + 2} className="px-3 py-4 text-zinc-500">
                  Sem dados no período/escopo.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const href = drillHref(r);
                return (
                  <tr key={r.meta_id} className="border-b border-black/[.04] dark:border-white/[.06]">
                    <td className="sticky left-0 z-10 max-w-[260px] truncate bg-background px-3 py-2">
                      {href ? (
                        <Link href={href} className="text-foreground underline-offset-2 hover:underline" title={r.name ?? ""}>
                          {r.name ?? "—"}
                        </Link>
                      ) : (
                        <span title={r.name ?? ""}>{r.name ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{statusBadge(r.effective_status)}</td>
                    {COLS.map((c) => (
                      <td key={c.h} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {c.f(r)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Tabela secundária: consolidado por criativo */}
      <h2 className="mb-3 text-sm font-medium text-zinc-500">Consolidado por criativo (mesmo nome across campanhas)</h2>
      <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.12]">
        <table className="w-full min-w-max text-xs">
          <thead className="bg-black/[.02] text-left text-zinc-500 dark:bg-white/[.03]">
            <tr className="border-b border-black/[.06] dark:border-white/[.08]">
              <th className="sticky left-0 z-10 bg-black/[.02] px-3 py-2 font-medium dark:bg-zinc-950">Criativo</th>
              {CREATIVE_COLS.map((c) => (
                <th key={c.h} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                  {c.h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {creatives.length === 0 ? (
              <tr>
                <td colSpan={CREATIVE_COLS.length + 1} className="px-3 py-4 text-zinc-500">
                  Sem dados.
                </td>
              </tr>
            ) : (
              creatives.map((r, i) => (
                <tr key={`${r.name}-${i}`} className="border-b border-black/[.04] dark:border-white/[.06]">
                  <td className="sticky left-0 z-10 max-w-[260px] truncate bg-background px-3 py-2" title={r.name ?? ""}>
                    {r.name ?? "—"}
                  </td>
                  {CREATIVE_COLS.map((c) => (
                    <td key={c.h} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {c.f(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-zinc-400">
        Compras/faturamento/funil usam o <b>nosso</b> last-click (só vendas rastreadas entram aqui). Métricas de vídeo
        ficam vazias em anúncio estático. Conjunto casa por ID (<code>utm_term</code>), campanha/criativo por nome.
      </p>
    </main>
  );
}
