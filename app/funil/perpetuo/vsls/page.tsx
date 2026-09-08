import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { hasCredential } from "@/lib/credentials";
import { resolveRange } from "@/lib/central";
import { getVslData } from "@/lib/vturb/read";
import DateButton from "../date-button";
import VslsView from "./vsls-view";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // o sync on-demand pode levar minutos

export default async function VslsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; dias?: string }>;
}) {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/configuracoes");

  const sp = await searchParams;
  const { from, to } = resolveRange(sp);
  const [data, hasKey] = await Promise.all([
    getVslData(projectId, from, to),
    hasCredential(projectId, "vturb", "api_key"),
  ]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg text-foreground">VSLs</h2>
        <DateButton />
      </div>
      <VslsView data={data} hasKey={hasKey} />
    </>
  );
}
