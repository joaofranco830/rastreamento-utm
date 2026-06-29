import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import Shell from "../shell";
import EmProducao from "../em-producao";

export const dynamic = "force-dynamic";

export default async function EmProducaoPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/configuracoes");
  const { t } = await searchParams;
  return (
    <Shell active="">
      <EmProducao titulo={t || "Em produção"} />
    </Shell>
  );
}
