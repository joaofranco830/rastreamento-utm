"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runMetaSyncForProject } from "@/lib/meta/sync";
import { getActiveProjectId } from "@/lib/tenant";

/**
 * Server action do botão "atualizar": só roda para usuário autenticado.
 * Dispara o sync do Meta do PROJETO ATIVO e revalida o dashboard.
 */
export async function refreshMeta(): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "não autenticado" };

  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "nenhum projeto ativo" };

  const result = await runMetaSyncForProject(projectId);
  revalidatePath("/central");
  revalidatePath("/v1");
  if (!result.ok && !result.skipped) {
    // loga detalhe no servidor; ao client vai uma mensagem genérica.
    console.error("[refreshMeta] sync falhou:", result.error);
  }
  return { ok: result.ok, skipped: result.skipped, error: result.ok || result.skipped ? undefined : "falha ao sincronizar" };
}
