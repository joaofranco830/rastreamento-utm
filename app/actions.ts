"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runMetaSync } from "@/lib/meta/sync";

/**
 * Server action do botão "atualizar": só roda para usuário autenticado.
 * Dispara o sync do Meta e revalida o dashboard.
 */
export async function refreshMeta(): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "não autenticado" };

  const result = await runMetaSync();
  revalidatePath("/");
  if (!result.ok && !result.skipped) {
    // loga detalhe no servidor; ao client vai uma mensagem genérica.
    console.error("[refreshMeta] sync falhou:", result.error);
  }
  return { ok: result.ok, skipped: result.skipped, error: result.ok || result.skipped ? undefined : "falha ao sincronizar" };
}
