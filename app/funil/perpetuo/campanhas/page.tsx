import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { resolveRange } from "@/lib/central";
import { getCampaignsTable, getCreativesConsolidated } from "@/lib/campanhas";
import CampaignsTree from "../../../campanhas/campaigns-tree";
import { CREATIVE_COLS } from "../../../campanhas/columns";
import DateButton from "../date-button";

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

  const [campaigns, creatives] = await Promise.all([
    getCampaignsTable(projectId, "campaign", null, from, to),
    getCreativesConsolidated(projectId, from, to),
  ]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg text-foreground">CAMPANHAS</h2>
        <DateButton />
      </div>
      <p className="mb-4 text-sm text-zinc-500">
        Clique no <span className="font-mono">▸</span> da campanha para abrir os conjuntos e anúncios (várias ao mesmo tempo).
      </p>

      <div className="mb-10">
        <CampaignsTree campaigns={campaigns} from={from} to={to} />
      </div>

      <h2 className="mb-3 text-sm font-medium text-zinc-500">Consolidado por criativo (mesmo nome across campanhas)</h2>
      <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.12]">
        <table className="w-full min-w-max text-xs">
          <thead className="bg-black/[.02] text-left text-zinc-500 dark:bg-white/[.03]">
            <tr className="border-b border-black/[.06] dark:border-white/[.08]">
              <th className="sticky left-0 z-10 bg-black/[.02] px-3 py-2 font-medium dark:bg-zinc-950">Criativo</th>
              {CREATIVE_COLS.map((c) => (
                <th key={c.h} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                  {c.h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {creatives.length === 0 ? (
              <tr>
                <td colSpan={CREATIVE_COLS.length + 1} className="px-3 py-4 text-zinc-500">
                  Sem dados.
                </td>
              </tr>
            ) : (
              creatives.map((r, i) => (
                <tr key={`${r.name}-${i}`} className="border-b border-black/[.04] dark:border-white/[.06]">
                  <td className="sticky left-0 z-10 max-w-[280px] truncate bg-background px-3 py-2" title={r.name ?? ""}>
                    {r.name ?? "—"}
                  </td>
                  {CREATIVE_COLS.map((c) => (
                    <td key={c.h} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {c.f(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-zinc-400">
        Compras/faturamento/funil usam o <b>nosso</b> last-click (só vendas rastreadas entram). Métricas de vídeo ficam
        vazias em anúncio estático. Conjunto casa por ID (<code>utm_term</code>), campanha/criativo por nome.
      </p>
    </>
  );
}
