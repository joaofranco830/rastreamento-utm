"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { setProjectCredential } from "@/lib/credentials";
import { getVturbToken, listPlayers, VturbError } from "@/lib/vturb/client";
import { runVturbSync } from "@/lib/vturb/sync";

/** Sincroniza o Analytics do VSL (VTurb) do projeto. Admin-only. */
export async function syncVturbAction(): Promise<{ ok: boolean; error?: string; players?: number; rows?: number; withData?: number; errors?: number; firstError?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin"]);
  } catch {
    return { ok: false, error: "Só admin/owner pode sincronizar." };
  }
  try {
    const r = await runVturbSync(projectId);
    if (!r.ok) return { ok: false, error: r.skipped === "no_credentials" ? "Salve a API key do VTurb primeiro." : r.error ?? "Falha no sync." };
    revalidatePath("/funil/perpetuo/vsls");
    return { ok: true, players: r.players, rows: r.rows, withData: r.withData, errors: r.errors, firstError: r.firstError };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha no sync do VTurb." };
  }
}

/** Testa a conexão com o VTurb: lista os players (vídeos) da conta. Admin-only. */
export async function testVturbConnection(): Promise<{ ok: boolean; error?: string; players?: { id: string; name: string }[] }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin"]);
  } catch {
    return { ok: false, error: "Só admin/owner pode testar a conexão." };
  }
  const token = await getVturbToken(projectId).catch(() => null);
  if (!token) return { ok: false, error: "Nenhuma API key do VTurb salva neste projeto." };
  try {
    const players = await listPlayers(token);
    return { ok: true, players: players.slice(0, 50).map((p) => ({ id: p.id, name: p.name })) };
  } catch (e) {
    if (e instanceof VturbError) {
      if (e.status === 401) return { ok: false, error: "API key inválida (401). Confira a chave no VTurb." };
      if (e.status === 429) return { ok: false, error: "Limite de requisições atingido (429). Tente em instantes." };
      return { ok: false, error: `Erro do VTurb${e.code ? ` (código ${e.code})` : ""}: ${e.message}` };
    }
    return { ok: false, error: "Falha ao conectar no VTurb." };
  }
}

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

/** Salva a API key do VTurb Analytics do projeto no cofre (cifrada). Só admin/owner. */
export async function saveVturbAction(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin"]);
  } catch {
    return { ok: false, error: "Só admin/owner pode salvar credenciais." };
  }
  if (!apiKey.trim()) return { ok: false, error: "Informe a API key do VTurb." };
  try {
    await setProjectCredential(projectId, "vturb", "api_key", apiKey.trim());
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
