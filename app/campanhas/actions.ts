"use server";

import { createClient } from "@/lib/supabase/server";
import { getCampaignsTable, type CampaignRow, type Level } from "@/lib/campanhas";

/** Carrega filhos de uma entidade (conjuntos de uma campanha, anúncios de um conjunto). */
export async function loadChildren(
  level: Level,
  parentMetaId: string,
  from: string,
  to: string,
): Promise<CampaignRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return getCampaignsTable(level, parentMetaId, from, to);
}
