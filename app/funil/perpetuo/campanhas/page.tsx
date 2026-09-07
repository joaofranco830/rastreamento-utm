import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/central";
import { getPerpetuoFunnel } from "@/lib/funnel";
import { getCampaignsTable, getCreativesConsolidated, type Level } from "@/lib/campanhas";
import DateButton from "../date-button";
import CampaignsManager from "./campaigns-manager";

export const dynamic = "force-dynamic";

const LEVELS = new Set(["campaign", "adset", "creative"]);

export default async function CampanhasPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; dias?: string; level?: string; parents?: string; prods?: string }>;
}) {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/configuracoes");

  const sp = await searchParams;
  const { from, to } = resolveRange(sp);
  const level: Level = (LEVELS.has(sp.level ?? "") ? sp.level : "campaign") as Level;
  const parents = (sp.parents ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const productIds = (sp.prods ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const supabase = await createClient();
  const [funnel, prods, rows, creatives] = await Promise.all([
    getPerpetuoFunnel(projectId),
    supabase.from("products").select("product_id, name, role").eq("project_id", projectId).order("role"),
    getCampaignsTable(projectId, level, parents, productIds, from, to),
    getCreativesConsolidated(projectId, productIds, from, to),
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
        level={level}
        rows={rows}
        creatives={creatives}
        products={products}
        cols={cfg?.campaign_columns ?? null}
        presets={cfg?.campaign_presets ?? []}
        parents={parents}
        productIds={productIds}
      />
    </>
  );
}
