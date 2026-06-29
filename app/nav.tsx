import Link from "next/link";
import RefreshButton from "./refresh-button";
import LogoutButton from "./logout-button";
import ProjectSwitcher from "./project-switcher";
import { getVisibleProjects, getActiveProjectId } from "@/lib/tenant";

/**
 * Barra de navegação da V2 (compartilhada entre as telas). V2 é o padrão;
 * o dashboard antigo (v1) fica escondido em Configurações. Agora com o
 * seletor de projeto global (USR-05).
 */
const TABS: { href: string; label: string }[] = [
  { href: "/central", label: "Central" },
  { href: "/origem", label: "Origem" },
  { href: "/campanhas", label: "Campanhas" },
];

export default async function Nav({
  active,
  qs = "",
}: {
  active: "/central" | "/origem" | "/campanhas";
  qs?: string;
}) {
  const [projects, activeProject] = await Promise.all([
    getVisibleProjects(),
    getActiveProjectId(),
  ]);
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-black/[.07] pb-4 dark:border-white/[.08]">
      <div className="flex items-center gap-1">
        <span className="mr-2 text-sm font-semibold tracking-tight">Rastreamento UTM</span>
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={`${t.href}${qs}`}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active === t.href
                ? "bg-foreground text-background"
                : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-300 dark:hover:bg-white/[.06]"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <ProjectSwitcher projects={projects} active={activeProject} />
        <RefreshButton />
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-1.5 rounded-lg bg-black/[.06] px-3 py-2 text-sm font-medium transition-colors hover:bg-black/[.1] dark:bg-white/[.1] dark:hover:bg-white/[.16]"
        >
          <span aria-hidden>⚙️</span> Configurações
        </Link>
        <LogoutButton />
      </div>
    </header>
  );
}
