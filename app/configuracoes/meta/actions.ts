"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { setProjectCredential, getProjectCredential } from "@/lib/credentials";
import { listAdAccounts } from "@/lib/meta/client";
import { parseAccounts } from "@/lib/meta/creds";
import { runMetaSyncForProject } from "@/lib/meta/sync";

export interface AdAccountOption {
  id: string; // sem o prefixo act_ (ex.: 555908086246166)
  name: string;
}

/**
 * MIGRAÇÃO ÚNICA (transição): move as credenciais do Meta que ainda estejam em
 * variáveis de ambiente GLOBAIS (.env) para o COFRE do projeto ativo, para
 * eliminar o segredo global. Reaproveita o valor sem exigir o token em mãos.
 * Depois de rodar, apague META_ACCESS_TOKEN/META_AD_ACCOUNT_ID da Vercel.
 * Só admin/owner. Idempotente: se o cofre já tem, não sobrescreve.
 */
export async function migrateEnvMetaToVaultAction(): Promise<{ ok: boolean; migrated?: boolean; account?: string; synced?: boolean; error?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin"]);
  } catch {
    return { ok: false, error: "Só admin/owner." };
  }

  const envToken = (process.env.META_ACCESS_TOKEN ?? "").trim();
  const envAccount = (process.env.META_AD_ACCOUNT_ID ?? "").trim().replace(/^act_/, "");
  if (!envToken || !envAccount) {
    return { ok: true, migrated: false, error: "Nada para migrar: não há Meta no .env global (ok, pode apagar as variáveis da Vercel)." };
  }

  // Não sobrescreve credencial já existente no cofre do projeto.
  const existing = await getProjectCredential(projectId, "meta", "token").catch(() => null);
  if (existing) return { ok: true, migrated: false, error: "Este projeto já tem Meta no cofre — nada a migrar." };

  try {
    await setProjectCredential(projectId, "meta", "token", envToken);
    await setProjectCredential(projectId, "meta", "account_id", envAccount);
  } catch {
    return { ok: false, error: "Falha ao cifrar/salvar no cofre." };
  }

  let synced = false;
  try {
    const r = await runMetaSyncForProject(projectId, 365);
    synced = r.ok;
  } catch {
    synced = false;
  }

  revalidatePath("/configuracoes");
  revalidatePath("/configuracoes/meta");
  return { ok: true, migrated: true, account: envAccount, synced };
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
  accountIds: string[],
): Promise<{ ok: boolean; synced?: boolean; error?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin"]);
  } catch {
    return { ok: false, error: "Só admin/owner pode conectar o Meta." };
  }

  const tok = token.trim();
  const accs = Array.from(
    new Set((accountIds ?? []).map((a) => a.trim().replace(/^act_/, "")).filter(Boolean)),
  );
  if (!tok) return { ok: false, error: "Token ausente." };
  if (accs.length === 0) return { ok: false, error: "Selecione ao menos uma conta de anúncio." };

  try {
    await setProjectCredential(projectId, "meta", "token", tok);
    // várias contas ficam numa lista separada por vírgula no cofre.
    await setProjectCredential(projectId, "meta", "account_id", accs.join(","));
  } catch {
    return { ok: false, error: "Falha ao cifrar/salvar (verifique a chave do cofre)." };
  }

  // primeiro sync mais fundo (90 dias) para trazer o histórico; best-effort.
  let synced = false;
  try {
    const r = await runMetaSyncForProject(projectId, 365);
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

/**
 * Lista as contas que o token JÁ GUARDADO enxerga + marca as atualmente
 * selecionadas. Usado pelo gerenciador — não precisa colar o token de novo.
 */
export async function listStoredAdAccountsAction(): Promise<{
  ok: boolean;
  accounts?: AdAccountOption[];
  selected?: string[];
  error?: string;
}> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin"]);
  } catch {
    return { ok: false, error: "Só admin/owner pode gerenciar o Meta." };
  }

  const token = await getProjectCredential(projectId, "meta", "token").catch(() => null);
  if (!token) return { ok: false, error: "Nenhum token salvo. Conecte a BM primeiro." };

  try {
    const accounts = await listAdAccounts(token);
    const selectedRaw = await getProjectCredential(projectId, "meta", "account_id").catch(() => null);
    const selected = parseAccounts(selectedRaw);
    return { ok: true, accounts, selected };
  } catch (e) {
    const err = e as { isAuth?: boolean; message?: string };
    if (err.isAuth) return { ok: false, error: "O token salvo expirou. Reconecte a BM (colando um novo token)." };
    return { ok: false, error: err.message ?? "Falha ao consultar o Meta." };
  }
}

/**
 * Atualiza APENAS a lista de contas de anúncio do projeto (token intacto) e
 * re-sincroniza 365 dias. Só admin/owner.
 */
export async function updateAdAccountsAction(
  accountIds: string[],
): Promise<{ ok: boolean; synced?: boolean; error?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin"]);
  } catch {
    return { ok: false, error: "Só admin/owner pode gerenciar o Meta." };
  }

  const token = await getProjectCredential(projectId, "meta", "token").catch(() => null);
  if (!token) return { ok: false, error: "Nenhum token salvo. Conecte a BM primeiro." };

  const accs = Array.from(
    new Set((accountIds ?? []).map((a) => a.trim().replace(/^act_/, "")).filter(Boolean)),
  );
  if (accs.length === 0) return { ok: false, error: "Selecione ao menos uma conta de anúncio." };

  try {
    // só a lista de contas muda; o token permanece o mesmo no cofre.
    await setProjectCredential(projectId, "meta", "account_id", accs.join(","));
  } catch {
    return { ok: false, error: "Falha ao salvar a seleção." };
  }

  let synced = false;
  try {
    const r = await runMetaSyncForProject(projectId, 365);
    synced = r.ok;
  } catch {
    synced = false;
  }

  revalidatePath("/configuracoes");
  revalidatePath("/configuracoes/meta");
  return { ok: true, synced };
}

/**
 * Puxa o histórico do Meta para uma janela maior (mais de 90 dias). Reaproveita
 * token/contas já guardados. Idempotente (upsert por ad+dia). Só admin/owner.
 */
export async function syncHistoryAction(days: number): Promise<{ ok: boolean; insights?: number; error?: string }> {
  const projectId = await getActiveProjectId();
  if (!projectId) return { ok: false, error: "Sem projeto ativo." };
  try {
    await requireRole(projectId, ["admin"]);
  } catch {
    return { ok: false, error: "Só admin/owner pode sincronizar." };
  }

  const n = Math.floor(days);
  const window = Number.isFinite(n) ? Math.min(Math.max(n, 1), 730) : 365;

  try {
    const r = await runMetaSyncForProject(projectId, window);
    if (!r.ok && !r.skipped) return { ok: false, error: r.error ?? "Falha ao sincronizar." };
    revalidatePath("/funil/perpetuo");
    return { ok: true, insights: r.insights };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
