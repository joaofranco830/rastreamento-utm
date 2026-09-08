import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId, getVisibleProjects } from "@/lib/tenant";
import { hasCredential } from "@/lib/credentials";
import { VturbForm } from "../credential-forms";

export const dynamic = "force-dynamic";

export default async function VturbTab() {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/login");

  const [keySet, projects] = await Promise.all([
    hasCredential(projectId, "vturb", "api_key"),
    getVisibleProjects(),
  ]);
  const projectName = projects.find((p) => p.id === projectId)?.name ?? `Projeto ${projectId}`;

  return (
    <section>
      <h2 className="mb-2 text-lg font-medium">Integração VTurb (Analytics API)</h2>
      <p className="mb-4 text-sm text-zinc-400">
        Conecte a conta do VTurb do projeto <strong>{projectName}</strong> uma única vez — vale para todos os funis.
        A chave fica <strong>cifrada</strong> no cofre do projeto (nunca no navegador nem em logs).
      </p>

      <ol className="mt-1 list-decimal space-y-1.5 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
        <li>No VTurb: <strong>Configurações → Analytics API → Gerar nova API key</strong>.</li>
        <li>Copie a chave gerada e cole abaixo.</li>
        <li>Pronto — a chave fica salva no projeto para a sincronização (em breve).</li>
      </ol>

      <VturbForm configured={keySet} />

      <div className="mt-6 rounded-xl border border-black/[.08] bg-black/[.02] p-4 text-sm text-zinc-600 dark:border-white/[.1] dark:bg-white/[.02] dark:text-zinc-300">
        <p className="font-medium text-foreground">Como o VTurb conversa com a Hotmart</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>xcod</strong>: chave de conversão do VTurb (FRONT) — liga a sessão do vídeo à venda.</li>
          <li><strong>sck</strong>: rastreio de upsell do VTurb.</li>
          <li><strong>src</strong>: livre — é onde as UTMs viajam (já lidas no nosso rastreio).</li>
        </ul>
        <p className="mt-2 text-xs text-zinc-400">
          Com esta API key, vamos puxar do VTurb (pela chave de conversão do xcod) dados que só existem lá — UTMs completas,
          retenção do vídeo e engajamento — sem que um sistema atrapalhe o outro.
        </p>
      </div>
    </section>
  );
}
