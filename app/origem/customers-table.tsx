"use client";

import { useState, useTransition } from "react";
import { loadCustomerHistory, type HistoryRow } from "./actions";
import { classLabel } from "./labels";
import { brl } from "@/lib/format";
import type { CustomerRow } from "@/lib/origem";

function fdate(s: string | null): string {
  return s ? new Date(s).toLocaleDateString("pt-BR") : "—";
}

export default function CustomersTable({ customers }: { customers: CustomerRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});
  const [loadingFor, setLoadingFor] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(email: string) {
    if (open === email) {
      setOpen(null);
      return;
    }
    setOpen(email);
    if (!history[email]) {
      setLoadingFor(email);
      startTransition(async () => {
        const rows = await loadCustomerHistory(email);
        setHistory((h) => ({ ...h, [email]: rows }));
        setLoadingFor(null);
      });
    }
  }

  if (!customers.length) return <p className="text-sm text-zinc-400">Sem clientes no período.</p>;

  return (
    <div className="overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.12]">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-black/[.06] bg-black/[.02] px-4 py-2 text-xs text-zinc-400 dark:border-white/[.08] dark:bg-white/[.03]">
        <span>Cliente</span>
        <span className="text-right">Compras</span>
        <span className="text-right">Faturamento</span>
        <span className="text-right">Última origem</span>
      </div>
      <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
        {customers.map((c) => (
          <li key={c.buyer_email}>
            <button
              onClick={() => toggle(c.buyer_email)}
              className="grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-3 text-left hover:bg-black/[.02] dark:hover:bg-white/[.03]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{c.buyer_name ?? "—"}</span>
                <span className="block truncate text-xs text-zinc-400">{c.buyer_email}</span>
              </span>
              <span className="text-right text-sm tabular-nums">{c.orders}</span>
              <span className="text-right text-sm tabular-nums">{brl(c.net_revenue)}</span>
              <span className="text-right text-xs text-zinc-400">{classLabel(c.last_class)}</span>
            </button>
            {open === c.buyer_email && (
              <div className="border-t border-black/[.06] bg-black/[.015] px-4 py-3 dark:border-white/[.08] dark:bg-white/[.02]">
                {loadingFor === c.buyer_email && !history[c.buyer_email] ? (
                  <p className="text-xs text-zinc-400">carregando…</p>
                ) : (history[c.buyer_email]?.length ?? 0) === 0 ? (
                  <p className="text-xs text-zinc-400">Sem histórico.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {history[c.buyer_email].map((h) => (
                      <li
                        key={h.transaction}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <span className="text-zinc-600 dark:text-zinc-300">
                          {h.product_name ?? h.product_id ?? "—"}
                        </span>
                        <span className="flex items-center gap-3 text-zinc-400">
                          <span>{fdate(h.order_date)}</span>
                          <span>{classLabel(h.origin_class)}</span>
                          <span className="tabular-nums">{brl(h.net_value)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
