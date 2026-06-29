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

function NavLink({ item, active }: { item: Item; active: string }) {
  const isActive = active === item.href || active === item.label;
  return (
    <Link
      href={item.href}
      className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        isActive
          ? "bg-foreground font-medium text-background"
          : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-300 dark:hover:bg-white/[.06]"
      }`}
    >
      <span className="flex items-center gap-1.5">
        {item.soon && <span aria-hidden>🚧</span>}
        {item.label}
      </span>
      {item.badge && (
        <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
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
      <aside className="hidden w-60 shrink-0 flex-col gap-5 border-r border-black/[.07] px-3 py-5 md:flex dark:border-white/[.08]">
        <div className="px-2">
          <p className="text-sm font-semibold tracking-tight">Rastreamento UTM</p>
          <p className="text-[11px] text-zinc-400">Franco Advertising</p>
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
