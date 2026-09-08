import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Leitura da aba "Clientes" (server-only) POR PROJETO, via sessão (RLS por
 * filiação). Devolve uma linha por compra real; o agrupamento por e-mail e os
 * filtros de produto/UTM acontecem no client (volume baixo por projeto).
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
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clientes_orders", {
    p_project_id: projectId,
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(`clientes_orders: ${error.message}`);
  return (data ?? []) as ClienteOrder[];
}
