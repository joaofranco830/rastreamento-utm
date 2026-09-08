"use client";

import { useMemo, useState } from "react";
import type { ClienteOrder } from "@/lib/clientes";
import { paymentLabel } from "@/lib/dashboard-metrics";
import { brl, inteiro } from "@/lib/format";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const UTM_FIELDS = [
  { key: "utm_source", label: "utm_source" },
  { key: "utm_medium", label: "utm_medium" },
  { key: "utm_campaign", label: "utm_campaign" },
  { key: "utm_content", label: "utm_content" },
  { key: "utm_term", label: "utm_term" },
] as const;
type UtmKey = (typeof UTM_FIELDS)[number]["key"];

const STATUS_LABEL: Record<string, string> = {
  completed: "Aprovada",
  approved: "Aprovada",
  refunded: "Reembolsada",
  chargeback: "Chargeback",
  delayed: "Pendente",
};
function statusLabel(s: string | null): string {
  return s ? STATUS_LABEL[s] ?? s : "—";
}
function statusClass(s: string | null): string {
  if (s === "refunded" || s === "chargeback") return "bg-[#ff5a5a]/15 text-[#ff5a5a]";
  if (s === "delayed") return "bg-amber-400/15 text-amber-300";
  return "bg-[#3ddc84]/15 text-[#3ddc84]";
}
function fdate(s: string | null): string {
  return s ? new Date(s).toLocaleDateString("pt-BR") : "—";
}
function fdatetime(s: string | null): string {
  return s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

interface Customer {
  email: string;
  name: string | null;
  phone: string | null;
  orders: ClienteOrder[]; // todas as compras (histórico completo)
  count: number;
  revenue: number;
  last: string | null;
  first: string | null;
  products: string[];
}

// ---------------------------------------------------------------------------
export default function ClientesView({ orders }: { orders: ClienteOrder[] }) {
  const [productIds, setProductIds] = useState<Set<string> | null>(null); // null = todos
  const [utm, setUtm] = useState<Record<UtmKey, string>>({
    utm_source: "", utm_medium: "", utm_campaign: "", utm_content: "", utm_term: "",
  });
  const [search, setSearch] = useState("");
  const [openEmail, setOpenEmail] = useState<string | null>(null);

  // Opções de filtro derivadas dos próprios pedidos do período.
  const productOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orders) if (o.product_id) m.set(o.product_id, o.product_name ?? o.product_id);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  const utmOptions = useMemo(() => {
    const out: Record<UtmKey, string[]> = { utm_source: [], utm_medium: [], utm_campaign: [], utm_content: [], utm_term: [] };
    for (const f of UTM_FIELDS) {
      const s = new Set<string>();
      for (const o of orders) { const v = o[f.key]; if (v) s.add(v); }
      out[f.key] = [...s].sort();
    }
    return out;
  }, [orders]);
  const hasUtmData = UTM_FIELDS.some((f) => utmOptions[f.key].length > 0);

  // Um pedido casa com os filtros de produto/UTM?
  function orderMatches(o: ClienteOrder): boolean {
    if (productIds && (!o.product_id || !productIds.has(o.product_id))) return false;
    for (const f of UTM_FIELDS) if (utm[f.key] && o[f.key] !== utm[f.key]) return false;
    return true;
  }

  // Agrupa por e-mail; inclui o cliente se tiver ≥1 compra que casa com os filtros.
  // Os totais do cliente consideram TODAS as compras dele no período (histórico completo).
  const customers = useMemo(() => {
    const map = new Map<string, ClienteOrder[]>();
    for (const o of orders) {
      if (!o.buyer_email) continue;
      const arr = map.get(o.buyer_email) ?? [];
      arr.push(o);
      map.set(o.buyer_email, arr);
    }
    const q = search.trim().toLowerCase();
    const list: Customer[] = [];
    for (const [email, rows] of map) {
      if (!rows.some(orderMatches)) continue;
      const name = rows.find((r) => r.buyer_name)?.buyer_name ?? null;
      if (q && !(email.toLowerCase().includes(q) || (name ?? "").toLowerCase().includes(q))) continue;
      const sorted = [...rows].sort((a, b) => (b.order_date ?? "").localeCompare(a.order_date ?? ""));
      const products = [...new Set(rows.map((r) => r.product_name ?? r.product_id ?? "—"))];
      list.push({
        email,
        name,
        phone: rows.find((r) => r.buyer_phone)?.buyer_phone ?? null,
        orders: sorted,
        count: rows.length,
        revenue: rows.reduce((a, r) => a + Number(r.net_value || 0), 0),
        last: sorted[0]?.order_date ?? null,
        first: sorted[sorted.length - 1]?.order_date ?? null,
        products,
      });
    }
    return list.sort((a, b) => b.revenue - a.revenue);
  }, [orders, productIds, utm, search]);

  const totalRevenue = customers.reduce((a, c) => a + c.revenue, 0);
  const totalOrders = customers.reduce((a, c) => a + c.count, 0);

  function toggleProduct(id: string) {
    setProductIds((prev) => {
      const base = prev ?? new Set(productOptions.map((p) => p.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next.size === productOptions.length ? null : next;
    });
  }
  function clearFilters() {
    setProductIds(null);
    setUtm({ utm_source: "", utm_medium: "", utm_campaign: "", utm_content: "", utm_term: "" });
    setSearch("");
  }
  const filtersActive = productIds !== null || UTM_FIELDS.some((f) => utm[f.key]) || search.trim() !== "";

  function exportCsv() {
    const head = ["Nome", "Email", "Telefone", "Compras", "Faturamento", "Primeira compra", "Última compra", "Produtos", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = customers.map((c) => {
      const recent = c.orders[0];
      return [
        c.name ?? "", c.email, c.phone ?? "", c.count, Number(c.revenue).toFixed(2),
        fdate(c.first), fdate(c.last), c.products.join(" | "),
        recent?.utm_source ?? "", recent?.utm_medium ?? "", recent?.utm_campaign ?? "", recent?.utm_content ?? "", recent?.utm_term ?? "",
      ].map(esc).join(",");
    });
    const csv = "﻿" + [head.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const openCustomer = openEmail ? customers.find((c) => c.email === openEmail) ?? null : null;
  const prodLabel = productIds === null ? "Todos os produtos" : `${productIds.size} de ${productOptions.length} produtos`;

  return (
    <>
      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou e-mail…"
          className="min-w-[200px] flex-1 rounded-lg border border-white/[.16] bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-eletrico focus:outline-none"
        />

        {/* Produtos (multi) */}
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-white/[.16] px-3 py-2 text-sm text-zinc-200 hover:bg-white/[.06]">
            🏷️ {prodLabel} <span className="text-zinc-400" aria-hidden>▾</span>
          </summary>
          <div className="absolute right-0 z-30 mt-2 max-h-72 w-64 overflow-y-auto rounded-xl border border-white/[.14] bg-[var(--noite-2)] p-2 shadow-2xl">
            <button onClick={() => setProductIds(null)} className="mb-1 w-full rounded-md px-2 py-1 text-left text-xs text-eletrico-cl hover:bg-white/[.06]">Selecionar todos</button>
            {productOptions.map((p) => {
              const on = productIds === null || productIds.has(p.id);
              return (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/[.05]">
                  <input type="checkbox" checked={on} onChange={() => toggleProduct(p.id)} className="accent-eletrico" />
                  <span className="truncate text-foreground">{p.name}</span>
                </label>
              );
            })}
          </div>
        </details>

        {/* UTMs */}
        {UTM_FIELDS.map((f) => (
          <select
            key={f.key}
            value={utm[f.key]}
            onChange={(e) => setUtm((u) => ({ ...u, [f.key]: e.target.value }))}
            disabled={utmOptions[f.key].length === 0}
            className="rounded-lg border border-white/[.16] bg-[var(--noite-2)] px-2 py-2 text-sm text-zinc-200 disabled:opacity-40"
            title={f.label}
          >
            <option value="">{f.label}</option>
            {utmOptions[f.key].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        ))}

        {filtersActive && (
          <button onClick={clearFilters} className="rounded-lg border border-white/[.16] px-3 py-2 text-sm text-zinc-300 hover:bg-white/[.06]">Limpar</button>
        )}
        <button onClick={exportCsv} className="ml-auto rounded-lg bg-lima px-4 py-2 text-sm font-bold text-[var(--noite)] hover:opacity-90">
          Exportar CSV
        </button>
      </div>

      {!hasUtmData && (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Sem rastreio de UTM neste projeto/período — os filtros de UTM ficam vazios. Produto, data, busca e histórico funcionam normalmente.
        </p>
      )}

      {/* Resumo */}
      <p className="mb-3 text-sm text-zinc-300">
        <span className="font-semibold text-foreground">{inteiro(customers.length)}</span> clientes ·{" "}
        <span className="font-semibold text-foreground">{inteiro(totalOrders)}</span> compras ·{" "}
        <span className="font-semibold text-lima">{brl(totalRevenue)}</span>
      </p>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-white/[.1]">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-white/[.1] text-left font-mono text-[10px] uppercase tracking-wider text-aco">
              <th className="px-4 py-3 font-normal">Cliente</th>
              <th className="px-4 py-3 text-right font-normal">Compras</th>
              <th className="px-4 py-3 text-right font-normal">Faturamento</th>
              <th className="px-4 py-3 text-right font-normal">Última compra</th>
              <th className="px-4 py-3 font-normal">Produtos</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-400">Nenhum cliente com esses filtros.</td></tr>
            ) : customers.map((c) => (
              <tr
                key={c.email}
                onClick={() => setOpenEmail(c.email)}
                className="cursor-pointer border-b border-white/[.06] last:border-0 hover:bg-white/[.03]"
              >
                <td className="px-4 py-3">
                  <span className="block truncate font-medium text-foreground">{c.name ?? "—"}</span>
                  <span className="block truncate text-xs text-zinc-400">{c.email}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">{inteiro(c.count)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-display text-foreground">{brl(c.revenue)}</td>
                <td className="px-4 py-3 text-right text-zinc-300">{fdate(c.last)}</td>
                <td className="px-4 py-3">
                  <span className="line-clamp-1 text-xs text-zinc-300">{c.products.join(", ")}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openCustomer && <CustomerModal customer={openCustomer} onClose={() => setOpenEmail(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
function CustomerModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/80 p-4" onClick={onClose}>
      <div
        className="my-8 w-full max-w-2xl rounded-2xl border border-white/[.12] bg-[var(--noite-2)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/[.08] p-5">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg text-foreground">{customer.name ?? "—"}</h3>
            <p className="mt-1 truncate text-sm text-zinc-300">{customer.email}</p>
            {customer.phone && <p className="text-sm text-zinc-400">{customer.phone}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg border border-white/[.14] px-2 py-1 text-sm text-zinc-300 hover:bg-white/[.06]">✕</button>
        </div>

        {/* resumo */}
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
          <div className="rounded-xl border border-white/[.1] p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-aco">Compras</p>
            <p className="font-display mt-1 text-xl text-foreground">{inteiro(customer.count)}</p>
          </div>
          <div className="rounded-xl border border-white/[.1] p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-aco">Faturamento</p>
            <p className="font-display mt-1 text-xl text-lima">{brl(customer.revenue)}</p>
          </div>
          <div className="rounded-xl border border-white/[.1] p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-aco">Cliente desde</p>
            <p className="font-display mt-1 text-xl text-foreground">{fdate(customer.first)}</p>
          </div>
        </div>

        {/* histórico de compras */}
        <div className="border-t border-white/[.08] p-5">
          <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-lima">Histórico de compras</p>
          <ul className="space-y-3">
            {customer.orders.map((o) => {
              const utms = UTM_FIELDS.map((f) => ({ label: f.label, value: o[f.key] })).filter((x) => x.value);
              return (
                <li key={o.transaction} className="rounded-xl border border-white/[.1] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{o.product_name ?? o.product_id ?? "—"}</p>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {paymentLabel(o.payment_type ?? "")}{o.installments > 1 ? ` · ${o.installments}x` : ""} · {fdatetime(o.order_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-foreground">{brl(o.net_value)}</p>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass(o.status)}`}>{statusLabel(o.status)}</span>
                    </div>
                  </div>
                  {utms.length > 0 ? (
                    <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 border-t border-white/[.06] pt-3 sm:grid-cols-2">
                      {utms.map((u) => (
                        <p key={u.label} className="flex gap-2 text-xs">
                          <span className="shrink-0 font-mono text-aco">{u.label}</span>
                          <span className="truncate text-zinc-200" title={u.value ?? ""}>{u.value}</span>
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 border-t border-white/[.06] pt-3 text-xs text-zinc-500">Sem rastreio de UTM nesta compra.</p>
                  )}
                  <p className="mt-2 font-mono text-[10px] text-zinc-500">{o.transaction}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
