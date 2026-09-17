import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Leitura da aba "Clientes" (server-only) POR PROJETO. Usa o cliente ADMIN
 * (service_role, sem RLS) — igual ao dashboard/campanhas — para não estourar o
 * statement_timeout sob RLS. Seguro: o projectId vem de getActiveProjectId()
 * (valida a filiação) e a função filtra por p_project_id. Devolve uma linha por
 * compra real; agrupamento/filtros acontecem no client.
 */

export interface ClienteOrder {
  transaction: string;
  buyer_email: string;
  buyer_name: string | null;
  buyer_phone: string | null;
  product_id: string | null;
  product_name: string | null;
  order_date: string | null;
  net_value: number;
  gross_value: number;
  status: string | null;
  payment_type: string | null;
  installments: number;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
}

export async function getClientesOrders(
  projectId: number,
  from: string,
  to: string,
): Promise<ClienteOrder[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("clientes_orders", {
    p_project_id: projectId,
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(`clientes_orders: ${error.message}`);
  return (data ?? []) as ClienteOrder[];
}
