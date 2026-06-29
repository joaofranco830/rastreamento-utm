"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDashboardConfigAction } from "../funnel-actions";

const METRICS = [
  { key: "invested", label: "Investido" },
  { key: "net_revenue", label: "Faturamento (líq.)" },
  { key: "profit", label: "Lucro" },
  { key: "roas", label: "ROAS" },
  { key: "ticket_medio", label: "Ticket médio" },
  { key: "cac_total", label: "Custo/venda (total)" },
  { key: "cac_principal", label: "Custo/venda (principal)" },
  { key: "refund_rate", label: "Taxa de reembolso" },
  { key: "net_sales", label: "Nº vendas (total)" },
  { key: "net_sales_principal", label: "Nº vendas (principal)" },
];

export default function MetricsForm({ current }: { current: string[] | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sel, setSel] = useState<Set<string>>(new Set(current ?? METRICS.map((m) => m.key)));
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = (k: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {METRICS.map((m) => (
          <label
            key={m.key}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-black/[.1] p-2.5 text-sm dark:border-white/[.14]"
          >
            <input type="checkbox" checked={sel.has(m.key)} onChange={() => toggle(m.key)} />
            {m.label}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() =>
            start(async () => {
              const r = await saveDashboardConfigAction([...sel]);
              setMsg(r.ok ? "Salvo ✓" : r.error ?? "Falha.");
              if (r.ok) router.refresh();
            })
          }
          disabled={pending}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          Salvar pré-definição
        </button>
        {msg && <span className="text-sm text-zinc-500">{msg}</span>}
      </div>
    </div>
  );
}
