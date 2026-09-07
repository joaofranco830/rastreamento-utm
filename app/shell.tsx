import Link from "next/link";
import RefreshButton from "./refresh-button";
import LogoutButton from "./logout-button";
import ProjectSwitcher from "./project-switcher";
import { getVisibleProjects, getActiveProjectId } from "@/lib/tenant";
import { isOwner } from "@/lib/auth";

/**
 * Shell final da plataforma (ADR-v3-14 / §11): abas laterais com TODA a
 * navegação do mapa + seletor de projeto global no topo. Itens ainda não
 * construídos levam ao gate "Em produção" (🚧). O Perpétuo é marcado não-100%.
 */

type Item = { href: string; label: string; soon?: boolean; badge?: string };
type Group = { title?: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "Funis",
    items: [
      { href: "/funil/perpetuo", label: "Perpétuo", badge: "não 100%" },
      { href: "/em-producao?t=Funil+High+Ticket", label: "High Ticket", soon: true },
      { href: "/em-producao?t=Funil+de+Assinaturas", label: "Assinaturas", soon: true },
      { href: "/em-producao?t=Funil+de+Lançamento", label: "Lançamento", soon: true },
      { href: "/em-producao?t=Funil+de+Negócios+físicos", label: "Negócios físicos", soon: true },
      { href: "/em-producao?t=Funil+de+Venda+de+serviço", label: "Venda de serviço", soon: true },
    ],
  },
  {
    title: "CRM",
    items: [
      { href: "/em-producao?t=Leads+%26+Jornada", label: "Leads & Jornada", soon: true },
      { href: "/em-producao?t=Pesquisa+%2F+Pipeline", label: "Pesquisa / Pipeline", soon: true },
    ],
  },
  {
    items: [
      { href: "/configuracoes", label: "Configurar" },
      { href: "/em-producao?t=Meu+Negócio", label: "Meu Negócio", soon: true },
    ],
  },
];

/** Chevron duplo ascendente — símbolo da marca (Guia §02). */
function Chevron({ size = 26, color = "var(--lima)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 28 L24 14 L40 28" stroke={color} strokeWidth="4.4" />
      <path d="M8 39 L24 25 L40 39" stroke={color} strokeWidth="4.4" opacity="0.42" />
    </svg>
  );
}

function NavLink({ item, active }: { item: Item; active: string }) {
  const isActive = active === item.href || active === item.label;
  return (
    <Link
      href={item.href}
      className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        isActive
          ? "bg-eletrico font-medium text-white"
          : "text-zinc-400 hover:bg-white/[.06] hover:text-zinc-200"
      }`}
    >
      <span className="flex items-center gap-1.5">
        {item.soon && <span aria-hidden>🚧</span>}
        {item.label}
      </span>
      {item.badge && (
        <span className="rounded-full bg-lima/15 px-1.5 py-0.5 text-[10px] font-medium text-lima-esc">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

export default async function Shell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  const [projects, activeProject, owner] = await Promise.all([
    getVisibleProjects(),
    getActiveProjectId(),
    isOwner(),
  ]);

  return (
    <div className="flex min-h-full w-full flex-1">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col gap-5 border-r border-white/[.08] bg-[var(--noite-2)] px-3 py-5 md:flex">
        <div className="flex items-center gap-2.5 px-2">
          <Chevron size={30} />
          <div className="leading-none">
            <p className="font-display text-[19px] text-foreground">
              RASTREA<span className="text-eletrico">·</span>MENTO
            </p>
            <p className="mt-0.5 font-mono text-[10px] tracking-wider text-aco">FRANCO ADVERTISING</p>
          </div>
        </div>

        {owner && (
          <div className="flex flex-col gap-0.5">
            <NavLink item={{ href: "/admin", label: "Administração global" }} active={active} />
          </div>
        )}

        <nav className="flex flex-col gap-4">
          {GROUPS.map((g, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              {g.title && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {g.title}
                </p>
              )}
              {g.items.map((it) => (
                <NavLink key={it.label} item={it} active={active} />
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[.07] px-5 py-3 dark:border-white/[.08]">
          <ProjectSwitcher projects={projects} active={activeProject} />
          <div className="flex items-center gap-2">
            <RefreshButton />
            <LogoutButton />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
