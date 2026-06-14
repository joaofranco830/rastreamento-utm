import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Recomputa a atribuição de TODOS os pedidos chamando a RPC attribute_order
 * (idempotente). Pagina por cursor de id (não para no 1º lote).
 * Uso: operação manual e, na Fase 4, re-resolver ad_id depois de popular `ads`.
 */
export async function backfillAttributions(
  opts: { pageSize?: number } = {},
): Promise<Record<string, number>> {
  const supa = getSupabaseAdmin();
  const pageSize = opts.pageSize ?? 1000;
  const tally: Record<string, number> = {};
  let cursor = 0; // último id processado (ids são bigint crescente)

  for (;;) {
    const { data: orders, error } = await supa
      .from("orders")
      .select("id")
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(pageSize);
    if (error) throw error;
    if (!orders || orders.length === 0) break;

    for (const o of orders) {
      const { data, error: e } = await supa.rpc("attribute_order", {
        p_order_id: o.id,
      });
      const key = e ? "error" : String(data);
      tally[key] = (tally[key] ?? 0) + 1;
      cursor = o.id as number;
    }
    if (orders.length < pageSize) break;
  }
  return tally;
}
