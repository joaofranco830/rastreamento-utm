"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CampaignRow, Level, Metrics } from "@/lib/campanhas";
import { COLUMN_FMT, COLUMN_LABEL, orderedColumns } from "./columns";
import ColumnsConfig from "./columns-config";
import { loadCampaignRows } from "./actions";

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
const ROW_LIMITS = [10, 20, 50, 100];

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

type Sel = Record<Level, Set<string>>;

function parentsFor(level: Level, sel: Sel): string[] {
  if (level === "adset") return [...sel.campaign];
  if (level === "creative") return [...sel.adset, ...sel.campaign];
  return [];
}

export default function CampaignsManager({
  initialRows,
  from,
  to,
  products,
  cols,
  presets,
}: {
  initialRows: CampaignRow[];
  from: string;
  to: string;
  products: Product[];
  cols: string[] | null;
  presets: { name: string; cols: string[] }[];
}) {
  const [level, setLevel] = useState<Level>("campaign");
  const [sel, setSel] = useState<Sel>({ campaign: new Set(), adset: new Set(), creative: new Set() });
  const [productIds, setProductIds] = useState<string[]>([]);
  const [limit, setLimit] = useState(20);
  const [rows, setRows] = useState<CampaignRow[]>(initialRows);
  const [loading, setLoading] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  const first = useRef(true);

  const activeCols = orderedColumns(cols);
  const frontIds = products.filter((p) => p.role === "principal").map((p) => p.product_id);

  const parentsKey = parentsFor(level, sel).join(",");
  const productKey = productIds.join(",");

  // Refetch client-side quando muda nível/filtro de produto/limite/pais derivados.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return; // usa initialRows na 1ª renderização
    }
    let cancelled = false;
    setLoading(true);
    loadCampaignRows({ level, parentIds: parentsFor(level, sel), productIds, from, to, limit })
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
  }, [level, parentsKey, productKey, limit, from, to]);

  function toggleRow(id: string) {
    setSel((prev) => {
      const s = new Set(prev[level]);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return { ...prev, [level]: s };
    });
  }
  function toggleAll() {
    setSel((prev) => {
      const all = prev[level].size === rows.length ? new Set<string>() : new Set(rows.map((r) => r.meta_id));
      return { ...prev, [level]: all };
    });
  }
  function clearLevel(l: Level) {
    setSel((prev) => ({ ...prev, [l]: new Set() }));
  }

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
      {/* barra de níveis (abas com contador estilo gerenciador) */}
      <div className="flex flex-wrap items-center gap-1 border-b border-white/[.08] px-2 py-2">
        {LEVELS.map((l) => {
          const count = sel[l.key].size;
          return (
            <button
              key={l.key}
              onClick={() => setLevel(l.key)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                level === l.key ? "bg-eletrico/15 font-medium text-eletrico-cl" : "text-zinc-400 hover:bg-white/[.06]"
              }`}
            >
              <span aria-hidden>{l.icon}</span> {l.label}
              {count > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-eletrico px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {count} selec.
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearLevel(l.key);
                    }}
                    className="ml-0.5 cursor-pointer opacity-80 hover:opacity-100"
                  >
                    ✕
                  </span>
                </span>
              )}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          {/* limite de linhas */}
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded-lg border border-white/[.18] bg-[var(--noite-2)] px-2 py-2 text-sm text-zinc-200">
            {ROW_LIMITS.map((n) => (
              <option key={n} value={n}>{n} linhas</option>
            ))}
          </select>

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

      {/* tabela */}
      <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-50" : ""}`}>
        <table className="w-full min-w-max text-xs">
          <thead>
            <tr className="border-b border-white/[.08] text-left text-zinc-400">
              <th className="sticky left-0 z-20 bg-[var(--noite-2)] px-3 py-2.5">
                <input type="checkbox" checked={rows.length > 0 && sel[level].size === rows.length} onChange={toggleAll} className="h-3.5 w-3.5 accent-eletrico" />
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
              <tr><td colSpan={activeCols.length + 2} className="px-4 py-6 text-center text-zinc-500">{loading ? "Carregando…" : "Sem dados no período."}</td></tr>
            ) : (
              rows.map((r) => {
                const isSel = sel[level].has(r.meta_id);
                return (
                  <tr key={r.meta_id} className={`border-b border-white/[.05] ${isSel ? "bg-eletrico/[.08]" : "hover:bg-white/[.03]"}`}>
                    <td className={`sticky left-0 z-10 px-3 py-3 ${isSel ? "bg-[#191b2b]" : "bg-[var(--noite-2)]"}`}>
                      <input type="checkbox" checked={isSel} onChange={() => toggleRow(r.meta_id)} className="h-3.5 w-3.5 accent-eletrico" />
                    </td>
                    <td className={`sticky left-10 z-10 min-w-[320px] max-w-[380px] px-3 py-3 ${isSel ? "bg-[#191b2b]" : "bg-[var(--noite-2)]"}`}>
                      <div className="mb-1"><StatusPill status={r.effective_status} /></div>
                      <div className="truncate font-medium text-eletrico-cl" title={r.name ?? ""}>{r.name ?? "—"}</div>
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

      <p className="px-4 py-3 text-xs text-zinc-500">
        Faturamento/compras usam o <b>nosso</b> last-click (só vendas rastreadas entram). Conjunto casa por ID (<code>utm_term</code>), campanha/criativo por nome. O consolidado por criativo agora fica na aba <b>Criativos</b>.
      </p>
    </div>
  );
}
