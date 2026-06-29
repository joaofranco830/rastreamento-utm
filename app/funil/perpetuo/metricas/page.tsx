import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { getPerpetuoFunnel } from "@/lib/funnel";
import MetricsForm from "./metrics-form";

export const dynamic = "force-dynamic";

export default async function MetricasPage() {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/configuracoes");
  const funnel = await getPerpetuoFunnel(projectId);

  return (
    <div className="max-w-2xl">
      <h2 className="mb-1 text-base font-medium">Configurar dashboard</h2>
      <p className="mb-5 text-sm text-zinc-500">
        Escolha quais métricas aparecem nos cartões do Dashboard e salve sua pré-definição.
      </p>
      <MetricsForm current={funnel?.dashboard_config?.cards ?? null} />
    </div>
  );
}
