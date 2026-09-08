"use client";

import { useState, useTransition } from "react";
import { updateProduct } from "./actions";
import type { ProductRow } from "@/lib/config-store";

const ROLE_OPTIONS: { value: ProductRow["role"]; label: string }[] = [
  { value: "principal", label: "Principal" },
  { value: "order_bump", label: "Order bump" },
  { value: "upsell", label: "Upsell" },
  { value: "downsell", label: "Downsell" },
  { value: "ascension", label: "Ascensão" },
  { value: "other", label: "Outro" },
];

export default function ProductsManager({ products: initial }: { products: ProductRow[] }) {
  const [products, setProducts] = useState<ProductRow[]>(initial);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const includedCount = products.filter((p) => p.included).length;

  function apply(id: string, patch: Partial<ProductRow>) {
    const next = products.map((p) => (p.product_id === id ? { ...p, ...patch } : p));
    setProducts(next);
    const changed = next.find((p) => p.product_id === id);
    if (!changed) return;
    setSavingId(id);
    setErrorId(null);
    startTransition(async () => {
      const res = await updateProduct(changed.product_id, changed.included, changed.role);
      setSavingId(null);
      if (!res.ok) {
        setErrorId(id);
        // reverte visualmente em caso de falha
        setProducts((prev) =>
          prev.map((p) => (p.product_id === id ? initial.find((i) => i.product_id === id) ?? p : p)),
        );
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.12]">
      <div className="flex items-center justify-between border-b border-black/[.06] bg-black/[.02] px-4 py-2.5 text-xs text-zinc-400 dark:border-white/[.08] dark:bg-white/[.03]">
        <span>{products.length} produtos</span>
        <span>
          {includedCount} considerado{includedCount === 1 ? "" : "s"} no dashboard
        </span>
      </div>

      <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
        {products.map((p) => (
          <li
            key={p.product_id}
            className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
              p.included ? "" : "opacity-60"
            }`}
          >
            {/* Considerar */}
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={p.included}
                onChange={(e) => apply(p.product_id, { included: e.target.checked })}
                className="h-4 w-4 accent-foreground"
              />
              <span className="sr-only">Considerar {p.name} no dashboard</span>
            </label>

            {/* Nome + id */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name ?? "(sem nome)"}</p>
              <p className="text-xs text-zinc-400">ID {p.product_id}</p>
            </div>

            {/* Papel */}
            <select
              value={p.role}
              onChange={(e) => apply(p.product_id, { role: e.target.value as ProductRow["role"] })}
              disabled={!p.included}
              className="rounded-lg border border-black/[.12] bg-transparent px-2.5 py-1.5 text-sm disabled:opacity-50 dark:border-white/[.2]"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            {/* Status */}
            <span className="w-14 text-right text-xs text-zinc-400">
              {savingId === p.product_id ? "salvando…" : errorId === p.product_id ? "erro" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
