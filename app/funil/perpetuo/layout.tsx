import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { getPerpetuoFunnel } from "@/lib/funnel";
import Shell from "../../shell";
import RefreshButton from "../../refresh-button";
import FunnelTabs from "./funnel-header";

export const dynamic = "force-dynamic";

/**
 * Casca do funil Perpétuo. Topo FIXO (não muda ao navegar nas abas):
 * identidade do perpétuo + ações globais (Atualizar). Abaixo, as abas.
 * Cada aba traz os próprios controles (período etc.).
 */
export default async function FunilLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/configuracoes");

  const funnel = await getPerpetuoFunnel(projectId);
  const funnelName = funnel?.name ?? "Perpétuo";

  return (
    <Shell active="/funil/perpetuo">
      <div className="mx-auto w-full max-w-[1400px]">
        {/* ── Barra global do perpétuo (fixa entre as abas) ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[.1] bg-[var(--noite-2)] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-display text-2xl leading-none text-lima">∞</span>
            <div className="leading-tight">
              <p className="font-display text-base text-foreground">PERPÉTUO</p>
              <p className="mt-0.5 font-mono text-[11px] text-aco">{funnelName}</p>
            </div>
          </div>
          <RefreshButton />
        </div>

        {/* ── Abas (submenus) ── */}
        <FunnelTabs />

        {children}
      </div>
    </Shell>
  );
}
