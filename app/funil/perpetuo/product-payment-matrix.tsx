"use client";

import { useMemo, useState } from "react";
import type { ProductPaymentCell } from "@/lib/central";
import { paymentLabel } from "@/lib/dashboard-metrics";
import { brl, inteiro, pct } from "@/lib/format";

const ROLE_LABELS: Record<string, string> = {
  principal: "Principal",
  order_bump: "Order bump",
  upsell: "Upsell",
  downsell: "Downsell",
  ascension: "Ascensão",
  other: "Outros",
};

type View = "revenue" | "sales";

/** Matriz produto × forma de pagamento, com alternância faturamento × quantidade.
 *  Linhas = produtos (ordenados pelo total), colunas = formas de pagamento
 *  presentes no período; totais por linha e por coluna. */
export default function ProductPaymentMatrix({ cells }: { cells: ProductPaymentCell[] }) {
  const [view, setView] = useState<View>("revenue");
  const val = (c: ProductPaymentCell) => (view === "revenue" ? c.net_revenue : c.net_sales);
  const fmt = (v: number) => (view === "revenue" ? brl(v) : inteiro(v));

  const { products, payments, grid, colTotal, rowTotal, grand } = useMemo(() => {
    // Produtos (com nome/role) e formas de pagamento distintas.
    const prodMap = new Map<string, { name: string; role: string }>();
    const paySet = new Set<string>();
    for (const c of cells) {
      if (!prodMap.has(c.product_id)) prodMap.set(c.product_id, { name: c.name, role: c.role });
      paySet.add(c.payment_type);
    }
    // grid[product_id][payment_type] = valor da view atual.
    const grid = new Map<string, Map<string, number>>();
    const rowTotal = new Map<string, number>();
    const colTotal = new Map<string, number>();
    let grand = 0;
    for (const c of cells) {
      const v = val(c);
      if (!grid.has(c.product_id)) grid.set(c.product_id, new Map());
      grid.get(c.product_id)!.set(c.payment_type, v);
      rowTotal.set(c.product_id, (rowTotal.get(c.product_id) ?? 0) + v);
      colTotal.set(c.payment_type, (colTotal.get(c.payment_type) ?? 0) + v);
      grand += v;
    }
    const products = [...prodMap.entries()]
      .map(([id, meta]) => ({ id, ...meta }))
      .sort((a, b) => (rowTotal.get(b.id) ?? 0) - (rowTotal.get(a.id) ?? 0));
    const payments = [...paySet].sort((a, b) => (colTotal.get(b) ?? 0) - (colTotal.get(a) ?? 0));
    return { products, payments, grid, colTotal, rowTotal, grand };
  }, [cells, view]);

  return (
    <div className="rounded-xl border border-white/[.1] bg-[var(--noite-2)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[.08] p-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-aco">Produto × forma de pagamento</span>
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
            Quantidade
          </button>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="p-4 text-sm text-aco">Sem vendas no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-aco">
                <th className="sticky left-0 z-10 bg-[var(--noite-2)] px-3 py-2 font-normal">Produto</th>
                {payments.map((p) => (
                  <th key={p} className="whitespace-nowrap px-3 py-2 text-right font-normal">{paymentLabel(p)}</th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 text-right font-normal text-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {products.map((prod) => {
                const row = grid.get(prod.id);
                return (
                  <tr key={prod.id} className="border-t border-white/[.06]">
                    <td className="sticky left-0 z-10 bg-[var(--noite-2)] px-3 py-2">
                      <span className="text-foreground">{prod.name}</span>
                      <span className="ml-2 text-[11px] text-zinc-500">{ROLE_LABELS[prod.role] ?? prod.role}</span>
                    </td>
                    {payments.map((p) => {
                      const v = row?.get(p);
                      return (
                        <td key={p} className="whitespace-nowrap px-3 py-2 text-right text-foreground">
                          {v == null || v === 0 ? <span className="text-zinc-500">—</span> : fmt(v)}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-3 py-2 text-right font-display text-foreground">{fmt(rowTotal.get(prod.id) ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/[.14] font-display">
                <td className="sticky left-0 z-10 bg-[var(--noite-2)] px-3 py-2 text-right text-[11px] font-normal uppercase tracking-wider text-aco">Total</td>
                {payments.map((p) => (
                  <td key={p} className="whitespace-nowrap px-3 py-2 text-right text-foreground">
                    {fmt(colTotal.get(p) ?? 0)}
                    <span className="ml-1 text-[10px] font-sans text-zinc-500">{pct(grand > 0 ? (colTotal.get(p) ?? 0) / grand : 0)}</span>
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2 text-right text-lima">{fmt(grand)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
