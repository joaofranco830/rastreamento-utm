"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireRole } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { safeFetchHtml } from "@/lib/ssrf";
import type { UtmLink } from "@/lib/utm";

/** Salva (cria/atualiza) uma tabela de links nomeada. Escrita gated por papel. */
export async function saveLinkSetAction(input: {
  id?: number;
  name: string;
  baseUrl: string;
  links: UtmLink[];
}): Promise<{ ok: boolean; error?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin", "funcionario"]);
  } catch {
    return { ok: false, error: "Você não tem permissão para salvar." };
  }
  if (!input.name.trim() || !input.baseUrl.trim()) {
    return { ok: false, error: "Nome e URL base são obrigatórios." };
  }
  const admin = getSupabaseAdmin();
  if (input.id) {
    const { error } = await admin
      .from("utm_link_sets")
      .update({ name: input.name, base_url: input.baseUrl, links: input.links, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .eq("project_id", projectId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin
      .from("utm_link_sets")
      .insert({ project_id: projectId, name: input.name, base_url: input.baseUrl, links: input.links });
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/configuracoes/utm");
  return { ok: true };
}

export async function deleteLinkSetAction(id: number): Promise<{ ok: boolean }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false };
  try {
    await requireRole(projectId, ["admin", "funcionario"]);
  } catch {
    return { ok: false };
  }
  const admin = getSupabaseAdmin();
  await admin.from("utm_link_sets").delete().eq("id", id).eq("project_id", projectId);
  revalidatePath("/configuracoes/utm");
  return { ok: true };
}

/** Verificador de pixel: fetch server-side (anti-SSRF) e procura o snippet no HTML. */
export async function verifyPixelAction(
  url: string,
  pixelKey: string | null,
): Promise<{ found: boolean; detail: string }> {
  await requireUser();
  const r = await safeFetchHtml(url);
  if (!r.ok) return { found: false, detail: r.reason ?? "Não foi possível verificar." };
  const html = r.html ?? "";
  const found =
    /\/t\.js/i.test(html) ||
    html.includes("__faPixelKey") ||
    html.includes("fa_vid") ||
    (!!pixelKey && html.includes(pixelKey));
  return {
    found,
    detail: found
      ? "Pixel detectado no HTML servido. ✓"
      : "Não detectado no HTML servido. Se o pixel é injetado em runtime (ex.: gerenciador de tags), pode não aparecer aqui — verifique manualmente.",
  };
}
