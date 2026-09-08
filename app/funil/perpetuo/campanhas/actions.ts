"use server";

import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { getCampaignsTable, getCreativesConsolidated, type CampaignRow, type CreativeRow, type Level } from "@/lib/campanhas";

/** Busca as linhas de um nível (client-side, sem recarregar a página). */
export async function loadCampaignRows(input: {
  level: Level;
  parentIds: string[];
  productIds: string[];
  from: string;
  to: string;
  limit: number;
}): Promise<{ ok: boolean; rows: CampaignRow[]; error?: string }> {
  try {
    await requireUser();
    const projectId = await getActiveProjectId();
    if (!projectId) return { ok: false, rows: [], error: "Sem projeto ativo." };
    const rows = await getCampaignsTable(
      projectId,
      input.level,
      input.parentIds.length ? input.parentIds : null,
      input.productIds.length ? input.productIds : null,
      input.from,
      input.to,
      input.limit,
    );
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, rows: [], error: e instanceof Error ? e.message : "Falha ao carregar." };
  }
}

/** Consolidado por criativo (aba Criativos), client-side. */
export async function loadCreativeRows(input: {
  productIds: string[];
  from: string;
  to: string;
}): Promise<{ ok: boolean; rows: CreativeRow[]; error?: string }> {
  try {
    await requireUser();
    const projectId = await getActiveProjectId();
    if (!projectId) return { ok: false, rows: [], error: "Sem projeto ativo." };
    const rows = await getCreativesConsolidated(projectId, input.productIds.length ? input.productIds : null, input.from, input.to);
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, rows: [], error: e instanceof Error ? e.message : "Falha ao carregar." };
  }
}
