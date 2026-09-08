"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CreativeRow, Metrics } from "@/lib/campanhas";
import { COLUMN_FMT, COLUMN_LABEL, orderedColumns } from "../campanhas/columns";
import ColumnsConfig from "../campanhas/columns-config";
import RowLimit from "../campanhas/row-limit";
import AdPreview from "../campanhas/ad-preview";
import Spinner from "../campanhas/spinner";
import { loadCreativeRows } from "../campanhas/actions";

interface Product {
  product_id: string;
  name: string | null;
  role: string;
}

const EMPTY: Metrics = {
  spend: 0, impressions: 0, link_clicks: 0, leads: 0, follows: 0,
  video_3s: 0, video_p25: 0, video_p50: 0, video_p75: 0, video_p95: 0, video_p100: 0, video_plays: 0,
  net_revenue: 0, rev_principal: 0, refunded_value: 0, refund_count: 0,
  purchases_total: 0, purchases_principal: 0, reverted: 0, paid: 0,
  unique_customers: 0, pageviews: 0, checkouts: 0,
};
function sumMetrics(rows: Metrics[]): Metrics {
  const t = { ...EMPTY };
  for (const r of rows) for (const k of Object.keys(t) as (keyof Metrics)[]) t[k] += Number(r[k]) || 0;
  return t;
}

export default function CreativesTable({
  initialRows,
  from,
  to,
  products,
  cols,
  presets,
}: {
  initialRows: CreativeRow[];
  from: string;
  to: string;
  products: Product[];
  cols: string[] | null;
  presets: { name: string; cols: string[] }[];
}) {
  const [productIds, setProductIds] = useState<string[]>([]);
  const [limit, setLimit] = useState(20);
  const [rows, setRows] = useState<CreativeRow[]>(initialRows);
  const [loading, setLoading] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  const first = useRef(true);

  const activeCols = orderedColumns(cols);
  const frontIds = products.filter((p) => p.role === "principal").map((p) => p.product_id);
  const productKey = productIds.join(",");

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadCreativeRows({ productIds, from, to, limit })
      .then((r) => {
        if (!cancelled) setRows(r.ok ? r.rows : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKey, limit, from, to]);

  const totals = useMemo(() => sumMetrics(rows), [rows]);

  const prodLabel =
    productIds.length === 0
      ? "Todos os produtos"
      : frontIds.length > 0 && productIds.length === frontIds.length && frontIds.every((f) => productIds.includes(f))
        ? "Apenas front"
        : `${productIds.length} produto(s)`;

  function applyProducts(ids: string[]) {
    setProdOpen(false);
    setProductIds(ids);
  }
  function toggleProduct(id: string) {
    const s = new Set(productIds);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setProductIds([...s]);
  }

  return (
    <div className="rounded-2xl border border-white/[.1] bg-[var(--noite-2)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[.08] px-2 py-2">
        <span className="px-2 font-mono text-[11px] uppercase tracking-wider text-aco">Consolidado por criativo (mesmo nome entre campanhas)</span>
        <div className="ml-auto flex items-center gap-2">
          <RowLimit value={limit} onChange={setLimit} />
          <div className="relative">
            <button onClick={() => setProdOpen((o) => !o)} className="inline-flex items-center gap-2 rounded-lg border border-white/[.18] px-3 py-2 text-sm text-zinc-200 hover:bg-white/[.06]">
              <span aria-hidden>🏷️</span> {prodLabel} <span className="text-zinc-400" aria-hidden>▾</span>
            </button>
            {prodOpen && (
              <div className="absolute right-0 z-30 mt-2 max-h-80 w-72 overflow-y-auto rounded-xl border border-white/[.14] bg-[var(--noite-2)] p-2 shadow-xl">
                <button onClick={() => applyProducts([])} className={`mb-1 block w-full rounded-lg px-3 py-1.5 text-left text-sm ${productIds.length === 0 ? "bg-eletrico/20 text-eletrico-cl" : "hover:bg-white/[.06]"}`}>Todos os produtos</button>
                {frontIds.length > 0 && <button onClick={() => applyProducts(frontIds)} className="mb-1 block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-white/[.06]">Apenas front</button>}
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

      <div className="relative">
        <Spinner show={loading} />
        <div className="overflow-auto rounded-b-2xl" style={{ height: "calc(100dvh - 300px)", minHeight: "360px" }}>
          <table className="w-full min-w-max text-xs">
            <thead>
              <tr className="text-left text-zinc-400">
                <th className="sticky left-0 top-0 z-40 min-w-[320px] border-b border-white/[.08] bg-[var(--noite-2)] px-3 py-2.5 font-medium">Criativo</th>
                {activeCols.map((c) => (
                  <th key={c} className="sticky top-0 z-30 whitespace-nowrap border-b border-white/[.08] bg-[var(--noite-2)] px-4 py-2.5 text-right font-medium">{COLUMN_LABEL[c]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={activeCols.length + 1} className="px-4 py-10 text-center text-zinc-400">{loading ? "" : "Sem dados."}</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="border-b border-white/[.05] hover:bg-white/[.03]">
                    <td className="sticky left-0 z-10 min-w-[320px] max-w-[400px] bg-[var(--noite-2)] px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-zinc-400">{i + 1}</span>
                        <AdPreview adMetaId={r.ad_meta_id} name={r.name} />
                        <span className="truncate font-medium text-foreground" title={r.name ?? ""}>{r.name ?? "—"}</span>
                      </div>
                    </td>
                    {activeCols.map((c) => (
                      <td key={c} className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-zinc-200">{COLUMN_FMT[c](r)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="font-medium">
                  <td className="sticky bottom-0 left-0 z-40 border-t-2 border-white/[.12] bg-[#14141c] px-3 py-3 text-zinc-300">Resultados de {rows.length} criativos</td>
                  {activeCols.map((c) => (
                    <td key={c} className="sticky bottom-0 z-30 whitespace-nowrap border-t-2 border-white/[.12] bg-[#14141c] px-4 py-3 text-right tabular-nums text-foreground">{COLUMN_FMT[c](totals)}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
