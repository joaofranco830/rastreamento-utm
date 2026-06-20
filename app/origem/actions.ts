"use server";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface HistoryRow {
  transaction: string;
  product_id: string | null;
  product_name: string | null;
  order_date: string | null;
  net_value: number;
  status: string | null;
  origin_class: string | null;
  utm_campaign: string | null;
}

/** Histórico de compras de um cliente (por e-mail). Só para usuário logado. */
export async function loadCustomerHistory(email: string): Promise<HistoryRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("customer_history", { p_buyer_email: email });
  if (error) {
    console.error("[loadCustomerHistory] falha:", error.message);
    return [];
  }
  return (data ?? []) as HistoryRow[];
}
