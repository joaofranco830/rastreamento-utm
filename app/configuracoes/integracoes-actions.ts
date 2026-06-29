"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { setProjectCredential } from "@/lib/credentials";

/** Salva o Hottok do projeto no cofre (cifrado). Só admin/owner. (INT-03) */
export async function saveHottokAction(value: string): Promise<{ ok: boolean; error?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin"]);
  } catch {
    return { ok: false, error: "Só admin/owner pode salvar credenciais." };
  }
  if (!value.trim()) return { ok: false, error: "Informe o Hottok." };
  try {
    await setProjectCredential(projectId, "hotmart", "hottok", value.trim());
  } catch {
    return { ok: false, error: "Falha ao cifrar/salvar (verifique a chave do cofre)." };
  }
  revalidatePath("/configuracoes");
  return { ok: true };
}

/** Salva token + conta do Meta do projeto no cofre. Só admin/owner. (INT-02) */
export async function saveMetaAction(token: string, accountId: string): Promise<{ ok: boolean; error?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin"]);
  } catch {
    return { ok: false, error: "Só admin/owner pode salvar credenciais." };
  }
  try {
    if (token.trim()) await setProjectCredential(projectId, "meta", "token", token.trim());
    if (accountId.trim()) await setProjectCredential(projectId, "meta", "account_id", accountId.trim().replace(/^act_/, ""));
  } catch {
    return { ok: false, error: "Falha ao cifrar/salvar (verifique a chave do cofre)." };
  }
  revalidatePath("/configuracoes");
  return { ok: true };
}
