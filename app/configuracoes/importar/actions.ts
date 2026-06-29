"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireRole } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Importação de vendas via CSV (INT-07): dedup por transaction; "não rastreada". */

export interface ImportMapping {
  transaction: string;
  gross_value: string;
  refunded_value?: string;
  status?: string;
  order_date?: string;
  product_id?: string;
  buyer_email?: string;
  buyer_name?: string;
}

function parseMoney(s: string): number {
  if (!s) return 0;
  let v = s.replace(/[^\d.,-]/g, "");
  if (v.includes(".") && v.includes(",")) v = v.replace(/\./g, "").replace(",", "."); // BR: 1.234,56
  else if (v.includes(",")) v = v.replace(",", ".");
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(s: string): string | null {
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}T00:00:00-03:00`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export async function importCsvAction(
  rows: Record<string, string>[],
  mapping: ImportMapping,
  filename: string,
): Promise<{ ok: boolean; inserted?: number; skipped?: number; total?: number; error?: string }> {
  const user = await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin", "funcionario"]);
  } catch {
    return { ok: false, error: "Você não tem permissão para importar." };
  }
  if (!mapping.transaction || !mapping.gross_value) {
    return { ok: false, error: "Mapeie ao menos Transação e Valor bruto." };
  }

  const get = (r: Record<string, string>, col?: string) => (col ? (r[col] ?? "") : "");

  const orders = rows
    .map((r) => {
      const transaction = get(r, mapping.transaction).trim();
      if (!transaction) return null;
      return {
        transaction,
        project_id: projectId,
        gross_value: parseMoney(get(r, mapping.gross_value)),
        refunded_value: mapping.refunded_value ? parseMoney(get(r, mapping.refunded_value)) : 0,
        status: (mapping.status ? get(r, mapping.status) : "") || "approved",
        order_date: mapping.order_date ? parseDate(get(r, mapping.order_date)) : null,
        product_id: mapping.product_id ? get(r, mapping.product_id) || null : null,
        buyer_email: mapping.buyer_email ? get(r, mapping.buyer_email) || null : null,
        buyer_name: mapping.buyer_name ? get(r, mapping.buyer_name) || null : null,
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  const total = orders.length;
  if (total === 0) return { ok: false, error: "Nenhuma linha válida (transação vazia?)." };

  const admin = getSupabaseAdmin();
  let inserted = 0;
  for (let i = 0; i < orders.length; i += 500) {
    const chunk = orders.slice(i, i + 500);
    // Dedup por transaction (unique global): linhas já existentes são ignoradas.
    const { data, error } = await admin
      .from("orders")
      .upsert(chunk, { onConflict: "transaction", ignoreDuplicates: true })
      .select("id");
    if (error) return { ok: false, error: error.message };
    inserted += data?.length ?? 0;
  }

  await admin.from("import_batches").insert({
    project_id: projectId,
    kind: "sales",
    filename: filename.slice(0, 200),
    row_count: inserted,
    created_by: user.id,
  });

  revalidatePath("/configuracoes/importar");
  return { ok: true, inserted, skipped: total - inserted, total };
}
