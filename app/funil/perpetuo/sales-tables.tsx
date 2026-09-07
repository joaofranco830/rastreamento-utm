"use client";

import { useMemo, useState } from "react";
import type { ProductBreakdown, PaymentBreakdown } from "@/lib/central";
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

/** Tabelas de vendas: produtos e formas de pagamento lado a lado, com uma
 *  única alternância faturamento × nº de vendas para as duas. */
export default function SalesTables({
  products,
  payments,
}: {
  products: ProductBreakdown[];
  payments: PaymentBreakdown[];
}) {
  const [view, setView] = useState<View>("revenue");

  return (
    <div className="rounded-xl border border-white/[.1] bg-[var(--noite-2)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[.08] p-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-aco">Vendas</span>
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

      <div className="grid grid-cols-1 gap-px bg-white/[.06] lg:grid-cols-2">
        <ProductPanel rows={products} view={view} />
        <PaymentPanel rows={payments} view={view} />
      </div>
    </div>
  );
}

function metricOf(v: number, total: number, view: View) {
  return {
    label: view === "revenue" ? brl(v) : inteiro(v),
    share: total > 0 ? v / total : 0,
  };
}

function ProductPanel({ rows, view }: { rows: ProductBreakdown[]; view: View }) {
  const { sorted, total } = useMemo(() => {
    const val = (r: ProductBreakdown) => (view === "revenue" ? r.net_revenue : r.net_sales);
    const sorted = [...rows].sort((a, b) => val(b) - val(a));
    return { sorted, total: sorted.reduce((a, r) => a + val(r), 0) };
  }, [rows, view]);

  return (
    <div className="bg-[var(--noite-2)] p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-aco">Produtos</p>
      {sorted.length === 0 ? (
        <p className="py-4 text-sm text-aco">Sem vendas no período.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {sorted.map((r) => {
              const m = metricOf(view === "revenue" ? r.net_revenue : r.net_sales, total, view);
              return (
                <tr key={r.product_id} className="border-t border-white/[.06] first:border-t-0">
                  <td className="py-2 pr-2">
                    <span className="text-foreground">{r.name}</span>
                    <span className="ml-2 text-[11px] text-zinc-500">{ROLE_LABELS[r.role] ?? r.role}</span>
                  </td>
                  <td className="whitespace-nowrap py-2 text-right font-display text-foreground">{m.label}</td>
                  <td className="w-12 whitespace-nowrap py-2 pl-2 text-right text-xs text-zinc-400">{pct(m.share)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PaymentPanel({ rows, view }: { rows: PaymentBreakdown[]; view: View }) {
  const { sorted, total } = useMemo(() => {
    const val = (r: PaymentBreakdown) => (view === "revenue" ? r.net_revenue : r.net_sales);
    const sorted = [...rows].sort((a, b) => val(b) - val(a));
    return { sorted, total: sorted.reduce((a, r) => a + val(r), 0) };
  }, [rows, view]);

  return (
    <div className="bg-[var(--noite-2)] p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-aco">Formas de pagamento</p>
      {sorted.length === 0 ? (
        <p className="py-4 text-sm text-aco">Sem vendas no período.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {sorted.map((r) => {
              const m = metricOf(view === "revenue" ? r.net_revenue : r.net_sales, total, view);
              return (
                <tr key={r.type} className="border-t border-white/[.06] first:border-t-0">
                  <td className="py-2 pr-2 text-foreground">{paymentLabel(r.type)}</td>
                  <td className="whitespace-nowrap py-2 text-right font-display text-foreground">{m.label}</td>
                  <td className="w-12 whitespace-nowrap py-2 pl-2 text-right text-xs text-zinc-400">{pct(m.share)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
