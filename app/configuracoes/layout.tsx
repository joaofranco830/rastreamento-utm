import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import Shell from "../shell";
import ConfigTabs from "./config-tabs";

export const dynamic = "force-dynamic";

/** Casca de Configurar: Shell + título + abas internas. Cada filho é uma aba. */
export default async function ConfigLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/login");

  return (
    <Shell active="/configuracoes">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Configurar</h1>
        <p className="mb-5 text-sm text-zinc-500">Configurações do projeto — cada tópico em uma aba.</p>
        <ConfigTabs />
        {children}
      </div>
    </Shell>
  );
}
