import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import Shell from "../../shell";
import CsvImporter from "./csv-importer";

export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/configuracoes");

  const supabase = await createClient();
  const { data: batches } = await supabase
    .from("import_batches")
    .select("id, filename, row_count, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <Shell active="/configuracoes">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Importar CSV de vendas</h1>
        <p className="mb-8 text-sm text-zinc-500">
          Preenche o histórico que o webhook não tem. Faturamento e nº de vendas continuam vindo do líquido (dedup por
          transação).
        </p>

        <CsvImporter />

        {batches && batches.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-medium text-zinc-500">Importações recentes</h2>
            <div className="divide-y divide-black/[.06] rounded-xl border border-black/[.08] dark:divide-white/[.08] dark:border-white/[.12]">
              {batches.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate font-mono text-xs">{b.filename ?? "—"}</span>
                  <span className="shrink-0 text-zinc-500">
                    {b.row_count} novas · {new Date(b.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Shell>
  );
}
