"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CampaignRow, CreativeRow, Level, Metrics } from "@/lib/campanhas";
import { COLUMN_FMT, COLUMN_LABEL, orderedColumns } from "./columns";
import ColumnsConfig from "./columns-config";

interface Product {
  product_id: string;
  name: string | null;
  role: string;
}

const LEVELS: { key: Level; label: string; icon: string; order: number }[] = [
  { key: "campaign", label: "Campanhas", icon: "📣", order: 0 },
  { key: "adset", label: "Conjuntos de anúncios", icon: "▦", order: 1 },
  { key: "creative", label: "Anúncios", icon: "▢", order: 2 },
];
const LEVEL_NOUN: Record<Level, string> = { campaign: "campanhas", adset: "conjuntos", creative: "anúncios" };

const EMPTY_METRICS: Metrics = {
  spend: 0, impressions: 0, link_clicks: 0, leads: 0, follows: 0,
  video_3s: 0, video_p25: 0, video_p50: 0, video_p75: 0, video_p95: 0, video_p100: 0, video_plays: 0,
  net_revenue: 0, rev_principal: 0, refunded_value: 0, refund_count: 0,
  purchases_total: 0, purchases_principal: 0, reverted: 0, paid: 0,
  unique_customers: 0, pageviews: 0, checkouts: 0,
};

function sumMetrics(rows: Metrics[]): Metrics {
  const t = { ...EMPTY_METRICS };
  for (const r of rows) for (const k of Object.keys(t) as (keyof Metrics)[]) t[k] += Number(r[k]) || 0;
  return t;
}

function StatusPill({ status }: { status: string | null }) {
  const active = status === "ACTIVE";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${active ? "bg-lima/15 text-lima" : "bg-white/[.06] text-zinc-400"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-lima" : "bg-zinc-500"}`} />
      {active ? "Ativo" : "Desativado"}
    </span>
  );
}

export default function CampaignsManager({
  level,
  rows,
  creatives,
  products,
  cols,
  presets,
  parents,
  productIds,
}: {
  level: Level;
  rows: CampaignRow[];
  creatives: CreativeRow[];
  products: Product[];
  cols: string[] | null;
  presets: { name: string; cols: string[] }[];
  parents: string[];
  productIds: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prodOpen, setProdOpen] = useState(false);

  const activeCols = orderedColumns(cols);
  const frontIds = products.filter((p) => p.role === "principal").map((p) => p.product_id);
  const curOrder = LEVELS.find((l) => l.key === level)!.order;

  function navigate(next: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  /** Navegação fluida: ao ir para um nível MAIS PROFUNDO, leva a seleção como filtro. */
  function goLevel(target: Level) {
    const deeper = LEVELS.find((l) => l.key === target)!.order > curOrder;
    const useSel = deeper && selected.size > 0;
    setSelected(new Set());
    navigate({ level: target, parents: useSel ? [...selected].join(",") : null });
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.meta_id))));
  }

  const totals = useMemo(() => sumMetrics(rows), [rows]);
  const creativeTotals = useMemo(() => sumMetrics(creatives), [creatives]);

  const prodLabel =
    productIds.length === 0
      ? "Todos os produtos"
      : frontIds.length > 0 && productIds.length === frontIds.length && frontIds.every((f) => productIds.includes(f))
        ? "Apenas front"
        : `${productIds.length} produto(s)`;

  function applyProducts(ids: string[]) {
    setProdOpen(false);
    navigate({ prods: ids.length ? ids.join(",") : null });
  }
  function toggleProduct(id: string) {
    const set = new Set(productIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    applyProducts([...set]);
  }

  const nextLabel = level === "campaign" ? "Conjuntos de anúncios" : level === "adset" ? "Anúncios" : null;

  return (
    <div className="rounded-2xl border border-white/[.1] bg-[var(--noite-2)]">
      {/* barra de níveis (abas estilo gerenciador) */}
      <div className="flex flex-wrap items-center gap-1 border-b border-white/[.08] px-2 py-2">
        {LEVELS.map((l) => (
          <button
            key={l.key}
            onClick={() => goLevel(l.key)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              level === l.key ? "bg-eletrico/15 font-medium text-eletrico-cl" : "text-zinc-400 hover:bg-white/[.06]"
            }`}
          >
            <span aria-hidden>{l.icon}</span> {l.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {/* filtro de produto */}
          <div className="relative">
            <button onClick={() => setProdOpen((o) => !o)} className="inline-flex items-center gap-2 rounded-lg border border-white/[.18] px-3 py-2 text-sm text-zinc-200 hover:bg-white/[.06]">
              <span aria-hidden>🏷️</span> {prodLabel} <span className="text-zinc-500" aria-hidden>▾</span>
            </button>
            {prodOpen && (
              <div className="absolute right-0 z-30 mt-2 max-h-80 w-72 overflow-y-auto rounded-xl border border-white/[.14] bg-[var(--noite-2)] p-2 shadow-xl">
                <button onClick={() => applyProducts([])} className={`mb-1 block w-full rounded-lg px-3 py-1.5 text-left text-sm ${productIds.length === 0 ? "bg-eletrico/20 text-eletrico-cl" : "hover:bg-white/[.06]"}`}>Todos os produtos</button>
                {frontIds.length > 0 && (
                  <button onClick={() => applyProducts(frontIds)} className="mb-1 block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-white/[.06]">Apenas front</button>
                )}
                <div className="my-1 border-t border-white/[.08]" />
                {products.map((p) => (
                  <label key={p.product_id} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-white/[.06]">
                    <input type="checkbox" checked={productIds.includes(p.product_id)} onChange={() => toggleProduct(p.product_id)} className="h-4 w-4 accent-eletrico" />
                    <span className="truncate">{p.name ?? p.product_id}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <ColumnsConfig current={cols ?? null} presets={presets} />
        </div>
      </div>

      {/* barra de seleção / filtro ativo */}
      {(selected.size > 0 || parents.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-white/[.08] bg-eletrico/[.06] px-4 py-2 text-xs">
          {selected.size > 0 ? (
            <>
              <span className="font-medium text-eletrico-cl">{selected.size} selecionado(s)</span>
              {nextLabel && <span className="text-zinc-400">— clique em <b className="text-zinc-200">{nextLabel}</b> para abrir os filhos</span>}
              <button onClick={() => setSelected(new Set())} className="text-zinc-400 underline hover:text-zinc-200">limpar seleção</button>
            </>
          ) : (
            <>
              <span className="text-zinc-300">Filtrado por {parents.length} selecionado(s)</span>
              <button onClick={() => navigate({ parents: null })} className="text-eletrico-cl underline">ver tudo</button>
            </>
          )}
        </div>
      )}

      {/* tabela principal */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-xs">
          <thead>
            <tr className="border-b border-white/[.08] text-left text-zinc-400">
              <th className="sticky left-0 z-20 bg-[var(--noite-2)] px-3 py-2.5">
                <input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleAll} className="h-3.5 w-3.5 accent-eletrico" />
              </th>
              <th className="sticky left-10 z-20 min-w-[320px] bg-[var(--noite-2)] px-3 py-2.5 font-medium">
                {LEVELS.find((l) => l.key === level)?.label}
              </th>
              {activeCols.map((c) => (
                <th key={c} className="whitespace-nowrap px-4 py-2.5 text-right font-medium">{COLUMN_LABEL[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={activeCols.length + 2} className="px-4 py-6 text-center text-zinc-500">Sem dados no período.</td></tr>
            ) : (
              rows.map((r) => {
                const sel = selected.has(r.meta_id);
                return (
                  <tr key={r.meta_id} className={`border-b border-white/[.05] ${sel ? "bg-eletrico/[.08]" : "hover:bg-white/[.03]"}`}>
                    <td className={`sticky left-0 z-10 px-3 py-3 ${sel ? "bg-[#191b2b]" : "bg-[var(--noite-2)]"}`}>
                      <input type="checkbox" checked={sel} onChange={() => toggleRow(r.meta_id)} className="h-3.5 w-3.5 accent-eletrico" />
                    </td>
                    <td className={`sticky left-10 z-10 min-w-[320px] max-w-[360px] px-3 py-3 ${sel ? "bg-[#191b2b]" : "bg-[var(--noite-2)]"}`}>
                      <div className="mb-1"><StatusPill status={r.effective_status} /></div>
                      <div className="truncate font-medium text-eletrico-cl" title={r.name ?? ""}>{r.name ?? "—"}</div>
                      <div className="truncate text-[10px] text-zinc-500">ID {r.meta_id}</div>
                    </td>
                    {activeCols.map((c) => (
                      <td key={c} className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-zinc-200">{COLUMN_FMT[c](r)}</td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-white/[.12] bg-white/[.03] font-medium">
                <td className="sticky left-0 z-10 bg-[#14141c] px-3 py-3" />
                <td className="sticky left-10 z-10 bg-[#14141c] px-3 py-3 text-zinc-300">Resultados de {rows.length} {LEVEL_NOUN[level]}</td>
                {activeCols.map((c) => (
                  <td key={c} className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-foreground">{COLUMN_FMT[c](totals)}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* consolidado por criativo */}
      <div className="border-t border-white/[.08] px-4 pb-1 pt-5">
        <h3 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-aco">Consolidado por criativo (mesmo nome entre campanhas)</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-xs">
          <thead>
            <tr className="border-b border-white/[.08] text-left text-zinc-400">
              <th className="sticky left-0 z-10 min-w-[320px] bg-[var(--noite-2)] px-3 py-2.5 font-medium">Criativo</th>
              {activeCols.map((c) => (
                <th key={c} className="whitespace-nowrap px-4 py-2.5 text-right font-medium">{COLUMN_LABEL[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {creatives.length === 0 ? (
              <tr><td colSpan={activeCols.length + 1} className="px-4 py-6 text-center text-zinc-500">Sem dados.</td></tr>
            ) : (
              creatives.map((r, i) => (
                <tr key={`${r.name}-${i}`} className="border-b border-white/[.05] hover:bg-white/[.03]">
                  <td className="sticky left-0 z-10 min-w-[320px] max-w-[360px] truncate bg-[var(--noite-2)] px-3 py-3 font-medium text-foreground" title={r.name ?? ""}>{r.name ?? "—"}</td>
                  {activeCols.map((c) => (
                    <td key={c} className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-zinc-200">{COLUMN_FMT[c](r)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {creatives.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-white/[.12] bg-white/[.03] font-medium">
                <td className="sticky left-0 z-10 bg-[#14141c] px-3 py-3 text-zinc-300">Resultados de {creatives.length} criativos</td>
                {activeCols.map((c) => (
                  <td key={c} className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-foreground">{COLUMN_FMT[c](creativeTotals)}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="px-4 py-3 text-xs text-zinc-500">
        Faturamento/compras usam o <b>nosso</b> last-click (só vendas rastreadas entram). Conjunto casa por ID (<code>utm_term</code>), campanha/criativo por nome. Vídeo fica vazio em anúncio estático.
      </p>
    </div>
  );
}
