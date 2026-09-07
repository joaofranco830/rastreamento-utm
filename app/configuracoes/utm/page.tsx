import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import UtmTool from "./utm-tool";

export const dynamic = "force-dynamic";

export default async function UtmPage() {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/configuracoes");

  const supabase = await createClient();
  const [{ data: sets }, { data: pixel }] = await Promise.all([
    supabase
      .from("utm_link_sets")
      .select("id, name, base_url, links, updated_at")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false }),
    supabase.from("project_pixels").select("pixel_key").eq("project_id", projectId).eq("active", true).maybeSingle(),
  ]);

  return <UtmTool savedSets={(sets ?? []) as never} pixelKey={pixel?.pixel_key ?? null} />;
}
