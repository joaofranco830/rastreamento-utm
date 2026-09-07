import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Leitura/escrita da config base da v2 (server-only). Usa o cliente admin
 * porque as tabelas têm RLS sem política (acesso só pelo servidor). As páginas
 * que chamam isto já estão protegidas por login.
 */

export const PRODUCT_ROLES = ["principal", "order_bump", "upsell", "downsell", "other"] as const;
export type ProductRole = (typeof PRODUCT_ROLES)[number];

export interface ProductRow {
  product_id: string;
  name: string | null;
  role: ProductRole;
  included: boolean;
}

export interface TrackingConfig {
  campaign_name_tags: string[];
  retention_days: number;
}

/** Produtos do registry DO PROJETO: incluídos primeiro, depois por nome. */
export async function getProducts(projectId: number): Promise<ProductRow[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("products")
    .select("product_id, name, role, included")
    .eq("project_id", projectId)
    .order("included", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new Error(`getProducts: ${error.message}`);
  return (data ?? []) as ProductRow[];
}

/** Config de rastreio DO PROJETO (1 linha por projeto — uq_tracking_config_project). */
export async function getTrackingConfig(projectId: number): Promise<TrackingConfig> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("tracking_config")
    .select("campaign_name_tags, retention_days")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(`getTrackingConfig: ${error.message}`);
  return {
    campaign_name_tags: data?.campaign_name_tags ?? [],
    retention_days: data?.retention_days ?? 90,
  };
}
