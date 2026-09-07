"use client";

import { useMemo, useState } from "react";
import type { ProductBreakdown } from "@/lib/central";
import { brl, inteiro, pct } from "@/lib/format";

const ROLE_LABELS: Record<string, string> = {
  principal: "Principal",
  order_bump: "Order bump",
  upsell: "Upsell",
  downsell: "Downsell",
  other: "Outros",
};

type View = "revenue" | "sales";

/** Tabela de produtos com alternância entre faturamento e nº de vendas. */
export default function ProductTable({ rows }: { rows: ProductBreakdown[] }) {
  const [view, setView] = useState<View>("revenue");

  const { sorted, total } = useMemo(() => {
    const val = (r: ProductBreakdown) => (view === "revenue" ? r.net_revenue : r.net_sales);
    const sorted = [...rows].sort((a, b) => val(b) - val(a));
    const total = sorted.reduce((acc, r) => acc + val(r), 0);
    return { sorted, total };
  }, [rows, view]);

  const fmt = (r: ProductBreakdown) => (view === "revenue" ? brl(r.net_revenue) : inteiro(r.net_sales));
  const share = (r: ProductBreakdown) => {
    const v = view === "revenue" ? r.net_revenue : r.net_sales;
    return total > 0 ? v / total : 0;
  };

  return (
    <div className="rounded-xl border border-white/[.1] bg-[var(--noite-2)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[.08] p-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-aco">
          {sorted.length} produto{sorted.length === 1 ? "" : "s"}
        </span>
        {/* toggle faturamento / quantidade */}
        <div className="inline-flex overflow-hidden rounded-lg border border-white/[.14] text-xs">
          <button
            onClick={() => setView("revenue")}
            className={`px-3 py-1.5 transition-colors ${view === "revenue" ? "bg-eletrico font-medium text-white" : "text-zinc-400 hover:bg-white/[.06]"}`}
          >
            Faturamento
          </button>
          <button
            onClick={() => setView("sales")}
            className={`px-3 py-1.5 transition-colors ${view === "sales" ? "bg-eletrico font-medium text-white" : "text-zinc-400 hover:bg-white/[.06]"}`}
          >
            Vendas
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="p-4 text-sm text-aco">Sem vendas no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-aco">
                <th className="px-3 py-2 font-normal">Produto</th>
                <th className="px-3 py-2 font-normal">Etapa</th>
                <th className="px-3 py-2 text-right font-normal">{view === "revenue" ? "Faturamento" : "Vendas"}</th>
                <th className="px-3 py-2 text-right font-normal">%</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.product_id} className="border-t border-white/[.06]">
                  <td className="px-3 py-2 text-foreground">{r.name}</td>
                  <td className="px-3 py-2 text-zinc-400">{ROLE_LABELS[r.role] ?? r.role}</td>
                  <td className="px-3 py-2 text-right font-display text-foreground">{fmt(r)}</td>
                  <td className="px-3 py-2 text-right text-zinc-400">{pct(share(r))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
