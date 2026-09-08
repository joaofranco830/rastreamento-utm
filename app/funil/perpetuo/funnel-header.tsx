"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/** Abas (submenus) do funil Perpétuo. Os controles de cada aba ficam na própria aba. */
const TABS = [
  { href: "/funil/perpetuo", label: "Dashboard" },
  { href: "/funil/perpetuo/origem", label: "Origem das UTMs" },
  { href: "/funil/perpetuo/campanhas", label: "Campanhas" },
  { href: "/funil/perpetuo/criativos", label: "Criativos" },
  { href: "/funil/perpetuo/visual", label: "Funil (visual)" },
  { href: "/funil/perpetuo/clientes", label: "Clientes" },
  { href: "/funil/perpetuo/configurar", label: "Configurar funil" },
];

export default function FunnelTabs() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const qs = sp.toString() ? `?${sp.toString()}` : "";

  return (
    <nav className="my-5 flex flex-wrap items-center gap-1 border-b border-white/[.08] pb-3">
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
  );
}
