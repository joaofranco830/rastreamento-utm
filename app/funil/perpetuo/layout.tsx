import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import Shell from "../../shell";
import FunnelHeader from "./funnel-header";

export const dynamic = "force-dynamic";

/** Casca do funil: Shell + título + menu interno (abas) + data. Os filhos são as abas. */
export default async function FunilLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/configuracoes");

  return (
    <Shell active="/funil/perpetuo">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="mb-3 flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Funil Perpétuo</h1>
          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
            não finalizado 100%
          </span>
        </div>
        <FunnelHeader />
        {children}
      </div>
    </Shell>
  );
}
