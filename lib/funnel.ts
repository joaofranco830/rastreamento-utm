import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Acesso ao funil ativo do projeto (por enquanto, 1 Perpétuo por projeto). */

export interface SourceFilters {
  campaign?: { mode: "all" | "contains"; tags: string[] };
  product?: { mode: "all" | "included" | "offer"; product_ids: string[] };
  recurrence?: "all" | "first";
  ad_account?: string | null;
  /** Contas de anúncio (meta_account_id) que ESTE funil mostra. Vazio/ausente = todas. */
  ad_accounts?: string[];
}

export interface FunnelRow {
  id: number;
  name: string;
  type: string;
  source_filters: SourceFilters | null;
  dashboard_config: { cards?: string[] } | null;
}

export async function getPerpetuoFunnel(projectId: number): Promise<FunnelRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("funnels")
    .select("id, name, type, source_filters, dashboard_config")
    .eq("project_id", projectId)
    .eq("type", "perpetuo")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as FunnelRow) ?? null;
}
