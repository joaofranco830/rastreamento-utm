import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/central";
import { getPerpetuoFunnel } from "@/lib/funnel";
import { getCampaignsTable } from "@/lib/campanhas";
import { getVslJoinMaps } from "@/lib/vturb/read";
import DateButton from "../date-button";
import CampaignsManager from "./campaigns-manager";

export const dynamic = "force-dynamic";

export default async function CampanhasPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; dias?: string }>;
}) {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/configuracoes");

  const sp = await searchParams;
  const { from, to } = resolveRange(sp);

  const supabase = await createClient();
  const [funnel, prods, rows, vsl] = await Promise.all([
    getPerpetuoFunnel(projectId),
    supabase.from("products").select("product_id, name, role").eq("project_id", projectId).order("role"),
    getCampaignsTable(projectId, "campaign", null, null, from, to, 20),
    getVslJoinMaps(projectId, from, to),
  ]);

  const cfg = funnel?.dashboard_config ?? null;
  const products = (prods.data ?? []) as { product_id: string; name: string | null; role: string }[];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg text-foreground">CAMPANHAS</h2>
        <DateButton />
      </div>

      <CampaignsManager
        initialRows={rows}
        from={from}
        to={to}
        products={products}
        cols={cfg?.campaign_columns ?? null}
        presets={cfg?.campaign_presets ?? []}
        vsl={vsl}
      />
    </>
  );
}
