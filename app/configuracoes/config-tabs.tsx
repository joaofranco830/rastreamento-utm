"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Abas internas de Configurar (submenus lado a lado). */
const TABS = [
  { href: "/configuracoes/pixel", label: "Pixel do Projeto" },
  { href: "/configuracoes/hotmart", label: "Integração Hotmart" },
  { href: "/configuracoes/meta", label: "Integração Meta" },
  { href: "/configuracoes/importar", label: "Importação de vendas antigas" },
  { href: "/configuracoes/utm", label: "Construtor de Links (UTMs)" },
];

export default function ConfigTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-black/[.07] pb-3 dark:border-white/[.08]">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-foreground font-medium text-background"
                : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-300 dark:hover:bg-white/[.06]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
