import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { getPerpetuoFunnel } from "@/lib/funnel";
import { createClient } from "@/lib/supabase/server";
import ConfigForm from "./config-form";

export const dynamic = "force-dynamic";

export default async function ConfigurarFunilPage() {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/configuracoes");

  const supabase = await createClient();
  const [funnel, { data: products }, { data: accounts }] = await Promise.all([
    getPerpetuoFunnel(projectId),
    supabase.from("products").select("product_id, name, role, included").eq("project_id", projectId).order("name"),
    supabase.from("ad_accounts").select("id, meta_account_id").eq("project_id", projectId),
  ]);

  return (
    <div className="max-w-2xl">
      <h2 className="mb-1 text-base font-medium">Configurar funil</h2>
      <p className="mb-5 text-sm text-zinc-500">
        Escopo de dados deste funil: conta de anúncio, campanhas, produtos, oferta e recorrência.
      </p>
      <ConfigForm products={products ?? []} accounts={accounts ?? []} sf={funnel?.source_filters ?? null} />
    </div>
  );
}
