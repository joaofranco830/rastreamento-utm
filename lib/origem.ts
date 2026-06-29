import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Leitura da Tela Origem (server-only) POR PROJETO, via sessão do usuário (RLS). */

export interface OrigemBucket {
  sales: number;
  net_revenue: number;
}
export interface OrigemOverview {
  total: OrigemBucket;
  tracked: OrigemBucket;
  untracked: OrigemBucket;
  by_class: { class: string; sales: number; net_revenue: number }[];
  by_source_medium: { source: string; medium: string; sales: number; net_revenue: number }[];
}
export interface CustomerRow {
  buyer_email: string;
  buyer_name: string | null;
  orders: number;
  net_revenue: number;
  first_order: string | null;
  last_order: string | null;
  last_class: string | null;
}

export async function getOrigem(
  projectId: number,
  from: string,
  to: string,
): Promise<{ overview: OrigemOverview; customers: CustomerRow[] }> {
  const supabase = await createClient();
  const [ov, cust] = await Promise.all([
    supabase.rpc("origem_overview", { p_project_id: projectId, p_from: from, p_to: to }),
    supabase.rpc("customers_list", { p_project_id: projectId, p_from: from, p_to: to }),
  ]);
  if (ov.error) throw new Error(`origem_overview: ${ov.error.message}`);
  if (cust.error) throw new Error(`customers_list: ${cust.error.message}`);
  return {
    overview: ov.data as OrigemOverview,
    customers: (cust.data ?? []) as CustomerRow[],
  };
}
