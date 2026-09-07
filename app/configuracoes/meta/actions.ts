"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { setProjectCredential } from "@/lib/credentials";
import { listAdAccounts } from "@/lib/meta/client";
import { runMetaSyncForProject } from "@/lib/meta/sync";

export interface AdAccountOption {
  id: string; // sem o prefixo act_ (ex.: 555908086246166)
  name: string;
}

/**
 * Passo "Testar conexão" do wizard: valida o token chamando /me/adaccounts e
 * devolve as contas de anúncio que ele enxerga. NÃO salva nada — só descoberta.
 * Só admin/owner do projeto ativo.
 */
export async function testMetaTokenAction(
  token: string,
): Promise<{ ok: boolean; accounts?: AdAccountOption[]; error?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin"]);
  } catch {
    return { ok: false, error: "Só admin/owner pode conectar o Meta." };
  }

  const tok = token.trim();
  if (!tok) return { ok: false, error: "Cole o token do System User." };

  try {
    const accounts = await listAdAccounts(tok);
    if (accounts.length === 0) {
      return {
        ok: false,
        error: "O token é válido, mas não enxerga nenhuma conta de anúncio. Confira se o System User tem acesso à conta na BM.",
      };
    }
    return { ok: true, accounts };
  } catch (e) {
    const err = e as { isAuth?: boolean; message?: string };
    if (err.isAuth) {
      return { ok: false, error: "Token inválido ou expirado. Gere um novo token do System User na BM." };
    }
    return { ok: false, error: err.message ?? "Falha ao consultar o Meta. Tente de novo em instantes." };
  }
}

/**
 * Passo final do wizard: grava token + conta no cofre do projeto (cifrados) e
 * dispara um primeiro sync para já popular o dashboard. Só admin/owner.
 */
export async function connectMetaAction(
  token: string,
  accountId: string,
): Promise<{ ok: boolean; synced?: boolean; error?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin"]);
  } catch {
    return { ok: false, error: "Só admin/owner pode conectar o Meta." };
  }

  const tok = token.trim();
  const acc = accountId.trim().replace(/^act_/, "");
  if (!tok) return { ok: false, error: "Token ausente." };
  if (!acc) return { ok: false, error: "Selecione uma conta de anúncio." };

  try {
    await setProjectCredential(projectId, "meta", "token", tok);
    await setProjectCredential(projectId, "meta", "account_id", acc);
  } catch {
    return { ok: false, error: "Falha ao cifrar/salvar (verifique a chave do cofre)." };
  }

  // primeiro sync (best-effort): se falhar, a conexão está salva mesmo assim.
  let synced = false;
  try {
    const r = await runMetaSyncForProject(projectId);
    synced = r.ok;
  } catch {
    synced = false;
  }

  revalidatePath("/configuracoes");
  revalidatePath("/configuracoes/meta");
  return { ok: true, synced };
}

/** Remove a integração Meta do projeto ativo (desconectar BM). Só admin/owner. */
export async function disconnectMetaAction(): Promise<{ ok: boolean; error?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin"]);
  } catch {
    return { ok: false, error: "Só admin/owner pode desconectar o Meta." };
  }

  // esvazia as credenciais (mantém a linha; próxima conexão sobrescreve).
  try {
    await setProjectCredential(projectId, "meta", "token", "");
    await setProjectCredential(projectId, "meta", "account_id", "");
  } catch {
    return { ok: false, error: "Falha ao remover credenciais." };
  }

  revalidatePath("/configuracoes");
  revalidatePath("/configuracoes/meta");
  return { ok: true };
}
