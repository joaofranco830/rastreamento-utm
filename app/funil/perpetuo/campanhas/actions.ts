"use server";

import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { getCampaignsTable, getCreativesConsolidated, type CampaignRow, type CreativeRow, type Level } from "@/lib/campanhas";
import { getProjectMetaCreds } from "@/lib/meta/creds";
import { fetchAdPreview } from "@/lib/meta/client";

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
  limit: number;
}): Promise<{ ok: boolean; rows: CreativeRow[]; error?: string }> {
  try {
    await requireUser();
    const projectId = await getActiveProjectId();
    if (!projectId) return { ok: false, rows: [], error: "Sem projeto ativo." };
    const rows = await getCreativesConsolidated(projectId, input.productIds.length ? input.productIds : null, input.from, input.to, input.limit);
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, rows: [], error: e instanceof Error ? e.message : "Falha ao carregar." };
  }
}

/** Busca o preview (iframe HTML) de um anúncio para visualizar o criativo. */
export async function getAdPreview(adMetaId: string): Promise<{ ok: boolean; html?: string; error?: string }> {
  try {
    await requireUser();
    const projectId = await getActiveProjectId();
    if (!projectId) return { ok: false, error: "Sem projeto ativo." };
    if (!adMetaId) return { ok: false, error: "Anúncio sem ID." };
    const creds = await getProjectMetaCreds(projectId);
    if (!creds) return { ok: false, error: "Sem conexão com o Meta neste projeto." };
    const html = await fetchAdPreview(creds.token, adMetaId);
    if (!html) return { ok: false, error: "Prévia indisponível para este anúncio." };
    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao buscar prévia." };
  }
}
