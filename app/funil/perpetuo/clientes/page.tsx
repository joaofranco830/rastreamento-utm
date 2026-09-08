import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { resolveRange } from "@/lib/central";
import { getClientesOrders } from "@/lib/clientes";
import DateButton from "../date-button";
import ClientesView from "./clientes-view";

export const dynamic = "force-dynamic";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; dias?: string }>;
}) {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/configuracoes");

  const sp = await searchParams;
  const { from, to } = resolveRange(sp);
  const orders = await getClientesOrders(projectId, from, to);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg text-foreground">CLIENTES</h2>
        <DateButton />
      </div>
      <ClientesView orders={orders} />
    </>
  );
}
