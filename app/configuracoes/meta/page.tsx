import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId, getVisibleProjects } from "@/lib/tenant";
import { getProjectCredential } from "@/lib/credentials";
import Shell from "../../shell";
import { MetaWizard } from "./wizard";
import { DisconnectMeta } from "./disconnect";

export const dynamic = "force-dynamic";

export default async function MetaConnectPage() {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/login");

  const projects = await getVisibleProjects();
  const projectName = projects.find((p) => p.id === projectId)?.name ?? `Projeto ${projectId}`;

  // status atual da conexão (server-only; lê o cofre).
  const token = await getProjectCredential(projectId, "meta", "token").catch(() => null);
  const accountRaw = await getProjectCredential(projectId, "meta", "account_id").catch(() => null);
  const accountList = (accountRaw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^act_/, ""))
    .filter(Boolean);
  const connected = !!(token && accountList.length > 0);

  return (
    <Shell active="/configuracoes">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-1 flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/configuracoes" className="hover:underline">
            Configurar
          </Link>
          <span>/</span>
          <span>Conectar Meta</span>
        </div>
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Conectar Business Manager (Meta)</h1>
        <p className="mb-6 text-sm text-zinc-500">
          Ligue a BM que anuncia os produtos do projeto <strong>{projectName}</strong>. Passo a passo — vale para qualquer BM
          nova depois.
        </p>

        {connected && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-400/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  BM conectada ✓ — {accountList.length} {accountList.length === 1 ? "conta" : "contas"}
                </p>
                <p className="mt-0.5 font-mono text-xs text-zinc-500">
                  {accountList.map((a) => `act_${a}`).join(", ")}
                </p>
              </div>
              <DisconnectMeta />
            </div>
          </div>
        )}

        <MetaWizard alreadyConnected={connected} />

        <p className="mt-6 text-xs text-zinc-400">
          🔒 O token fica <strong>cifrado</strong> no cofre do projeto (nunca no navegador nem em logs). Trocar de BM é só
          repetir o passo a passo — a nova conexão substitui a anterior.
        </p>
      </div>
    </Shell>
  );
}
