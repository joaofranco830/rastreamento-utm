"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import DateButton from "./date-button";

/** Menu interno do funil (abas horizontais) + botão de data, na mesma linha. */
const TABS = [
  { href: "/funil/perpetuo", label: "Dashboard" },
  { href: "/funil/perpetuo/origem", label: "Origem das UTMs" },
  { href: "/funil/perpetuo/campanhas", label: "Campanhas" },
  { href: "/funil/perpetuo/visual", label: "Funil (visual)" },
  { href: "/funil/perpetuo/metricas", label: "Configurar dashboard" },
  { href: "/funil/perpetuo/configurar", label: "Configurar funil" },
];

export default function FunnelHeader() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const qs = sp.toString() ? `?${sp.toString()}` : "";

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <nav className="flex flex-wrap items-center gap-1">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={`${t.href}${qs}`}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-eletrico font-medium text-white"
                  : "text-zinc-400 hover:bg-white/[.06] hover:text-zinc-200"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <DateButton />
    </div>
  );
}
