import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/central";
import { getPerpetuoFunnel } from "@/lib/funnel";
import { getCreativesConsolidated } from "@/lib/campanhas";
import DateButton from "../date-button";
import CreativesTable from "./creatives-table";

export const dynamic = "force-dynamic";

export default async function CriativosPage({
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
  const [funnel, prods, rows] = await Promise.all([
    getPerpetuoFunnel(projectId),
    supabase.from("products").select("product_id, name, role").eq("project_id", projectId).order("role"),
    getCreativesConsolidated(projectId, null, from, to),
  ]);

  const cfg = funnel?.dashboard_config ?? null;
  const products = (prods.data ?? []) as { product_id: string; name: string | null; role: string }[];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg text-foreground">CRIATIVOS</h2>
        <DateButton />
      </div>

      <CreativesTable
        initialRows={rows}
        from={from}
        to={to}
        products={products}
        cols={cfg?.campaign_columns ?? null}
        presets={cfg?.campaign_presets ?? []}
      />
    </>
  );
}
