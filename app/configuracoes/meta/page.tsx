import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId, getVisibleProjects } from "@/lib/tenant";
import { getProjectCredential } from "@/lib/credentials";
import { MetaWizard } from "./wizard";
import { DisconnectMeta } from "./disconnect";
import { ManageAccounts } from "./manage-accounts";
import { SyncHistory } from "./sync-history";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // sync de histórico (até ~1 ano) pode levar mais tempo

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
    <section>
      <h2 className="mb-1 text-lg font-medium">Integração Meta (Business Manager)</h2>
      <p className="mb-6 text-sm text-zinc-400">
        Ligue a BM que anuncia os produtos do projeto <strong>{projectName}</strong>. Passo a passo — vale para qualquer BM
        nova depois.
      </p>

      {connected ? (
          <>
            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-400/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    BM conectada ✓ — {accountList.length} {accountList.length === 1 ? "conta" : "contas"}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-zinc-400">
                    {accountList.map((a) => `act_${a}`).join(", ")}
                  </p>
                </div>
                <DisconnectMeta />
              </div>
              {/* Ajustar as contas usando o token já guardado — sem recolar o token. */}
              <div className="mt-3">
                <ManageAccounts />
              </div>
              {/* Puxar mais histórico (para ver períodos > 90 dias no dashboard). */}
              <SyncHistory />
            </div>

            <details>
              <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                Trocar de BM / colar um token novo
              </summary>
              <div className="mt-3">
                <MetaWizard alreadyConnected={connected} />
              </div>
            </details>
          </>
        ) : (
          <MetaWizard alreadyConnected={connected} />
        )}

        <p className="mt-6 text-xs text-zinc-400">
        🔒 O token fica <strong>cifrado</strong> no cofre do projeto (nunca no navegador nem em logs). Para só ajustar quais
        contas de anúncio entram, use <strong>“Escolher contas de anúncio”</strong> — o token guardado é reaproveitado.
      </p>
    </section>
  );
}
