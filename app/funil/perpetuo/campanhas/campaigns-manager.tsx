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

const LEVELS: { key: Level; label: string }[] = [
  { key: "campaign", label: "Campanhas" },
  { key: "adset", label: "Conjuntos de anúncios" },
  { key: "creative", label: "Anúncios" },
];

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

function statusDot(status: string | null) {
  const active = status === "ACTIVE";
  return <span className={`inline-block h-2 w-2 rounded-full ${active ? "bg-lima" : "bg-zinc-600"}`} title={status ?? "—"} />;
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

  /** Preserva from/to/dias; troca os params dados. */
  function navigate(next: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function goLevel(l: Level) {
    setSelected(new Set());
    navigate({ level: l, parents: null });
  }

  function drillInto(l: Level) {
    const ids = [...selected];
    setSelected(new Set());
    navigate({ level: l, parents: ids.length ? ids.join(",") : null });
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

  // rótulo do filtro de produto
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

  const drillLabel = level === "campaign" ? "Ver conjuntos" : level === "adset" ? "Ver anúncios" : null;
  const drillTarget: Level | null = level === "campaign" ? "adset" : level === "adset" ? "creative" : null;

  return (
    <div>
      {/* barra de controles */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* níveis */}
        <div className="inline-flex overflow-hidden rounded-lg border border-white/[.14] text-sm">
          {LEVELS.map((l) => (
            <button
              key={l.key}
              onClick={() => goLevel(l.key)}
              className={`px-3 py-2 transition-colors ${level === l.key ? "bg-eletrico font-medium text-white" : "text-zinc-400 hover:bg-white/[.06]"}`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* filtro de produto */}
        <div className="relative">
          <button onClick={() => setProdOpen((o) => !o)} className="inline-flex items-center gap-2 rounded-lg border border-white/[.18] px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-white/[.06]">
            <span aria-hidden>🏷️</span> {prodLabel} <span className="text-zinc-500" aria-hidden>▾</span>
          </button>
          {prodOpen && (
            <div className="absolute left-0 z-30 mt-2 max-h-80 w-72 overflow-y-auto rounded-xl border border-white/[.14] bg-[var(--noite-2)] p-2 shadow-xl">
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

        {/* drill-down dos selecionados */}
        {drillLabel && drillTarget && (
          <button
            onClick={() => drillInto(drillTarget)}
            disabled={selected.size === 0}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-lima px-3 py-2 text-sm font-bold text-[var(--noite)] disabled:opacity-40"
          >
            {drillLabel} {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        )}
      </div>

      {parents.length > 0 && (
        <p className="mb-3 text-xs text-aco">
          Filtrado por {parents.length} {level === "adset" ? "campanha(s)" : "conjunto(s)"} selecionada(s).{" "}
          <button onClick={() => navigate({ parents: null })} className="text-eletrico-cl underline">limpar</button>
        </p>
      )}

      {/* tabela principal (visão gerenciador) */}
      <div className="overflow-x-auto rounded-xl border border-white/[.1]">
        <table className="w-full min-w-max text-xs">
          <thead className="bg-white/[.03] text-left text-zinc-400">
            <tr className="border-b border-white/[.08]">
              <th className="sticky left-0 z-10 bg-[#14141c] px-2 py-2">
                <input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleAll} className="h-3.5 w-3.5 accent-eletrico" />
              </th>
              <th className="sticky left-8 z-10 bg-[#14141c] px-3 py-2 font-medium">{LEVELS.find((l) => l.key === level)?.label}</th>
              {activeCols.map((c) => (
                <th key={c} className="whitespace-nowrap px-3 py-2 text-right font-medium">{COLUMN_LABEL[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={activeCols.length + 2} className="px-3 py-4 text-zinc-500">Sem dados no período.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.meta_id} className="border-b border-white/[.05] hover:bg-white/[.02]">
                  <td className="sticky left-0 z-10 bg-background px-2 py-2">
                    <input type="checkbox" checked={selected.has(r.meta_id)} onChange={() => toggleRow(r.meta_id)} className="h-3.5 w-3.5 accent-eletrico" />
                  </td>
                  <td className="sticky left-8 z-10 max-w-[300px] truncate bg-background px-3 py-2" title={r.name ?? ""}>
                    <span className="mr-2 align-middle">{statusDot(r.effective_status)}</span>
                    {r.name ?? "—"}
                  </td>
                  {activeCols.map((c) => (
                    <td key={c} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{COLUMN_FMT[c](r)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-white/[.12] bg-white/[.03] font-medium">
                <td className="sticky left-0 z-10 bg-[#14141c] px-2 py-2" />
                <td className="sticky left-8 z-10 bg-[#14141c] px-3 py-2 text-zinc-300">{rows.length} {level === "campaign" ? "campanhas" : level === "adset" ? "conjuntos" : "anúncios"}</td>
                {activeCols.map((c) => (
                  <td key={c} className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-zinc-200">{COLUMN_FMT[c](totals)}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* consolidado por criativo */}
      <h3 className="mb-3 mt-10 font-mono text-[11px] uppercase tracking-wider text-aco">Consolidado por criativo (mesmo nome entre campanhas)</h3>
      <div className="overflow-x-auto rounded-xl border border-white/[.1]">
        <table className="w-full min-w-max text-xs">
          <thead className="bg-white/[.03] text-left text-zinc-400">
            <tr className="border-b border-white/[.08]">
              <th className="sticky left-0 z-10 bg-[#14141c] px-3 py-2 font-medium">Criativo</th>
              {activeCols.map((c) => (
                <th key={c} className="whitespace-nowrap px-3 py-2 text-right font-medium">{COLUMN_LABEL[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {creatives.length === 0 ? (
              <tr><td colSpan={activeCols.length + 1} className="px-3 py-4 text-zinc-500">Sem dados.</td></tr>
            ) : (
              creatives.map((r, i) => (
                <tr key={`${r.name}-${i}`} className="border-b border-white/[.05] hover:bg-white/[.02]">
                  <td className="sticky left-0 z-10 max-w-[300px] truncate bg-background px-3 py-2" title={r.name ?? ""}>{r.name ?? "—"}</td>
                  {activeCols.map((c) => (
                    <td key={c} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{COLUMN_FMT[c](r)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {creatives.length > 0 && (
            <tfoot>
              <tr className="border-t border-white/[.12] bg-white/[.03] font-medium">
                <td className="sticky left-0 z-10 bg-[#14141c] px-3 py-2 text-zinc-300">{creatives.length} criativos</td>
                {activeCols.map((c) => (
                  <td key={c} className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-zinc-200">{COLUMN_FMT[c](creativeTotals)}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        Faturamento/compras usam o <b>nosso</b> last-click (só vendas rastreadas entram). Conjunto casa por ID (<code>utm_term</code>), campanha/criativo por nome. Vídeo fica vazio em anúncio estático.
      </p>
    </div>
  );
}
