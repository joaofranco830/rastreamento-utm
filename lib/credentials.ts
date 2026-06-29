import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

/**
 * Acesso ao cofre de credenciais POR PROJETO (INT-04).
 * Cifra no Node (lib/crypto) e guarda só ciphertext/iv/auth_tag (base64) via
 * RPCs server-only. Leitura só em sync/webhook/admin (nunca no dashboard).
 */

export type Provider = "meta" | "hotmart";
export type Kind = "token" | "hottok" | "account_id";

export async function setProjectCredential(
  projectId: number,
  provider: Provider,
  kind: Kind,
  plaintext: string,
): Promise<void> {
  const sealed = await encryptSecret(plaintext);
  const supa = getSupabaseAdmin();
  const { error } = await supa.rpc("set_project_credential", {
    p_project_id: projectId,
    p_provider: provider,
    p_kind: kind,
    p_ciphertext_b64: sealed.ciphertext.toString("base64"),
    p_iv_b64: sealed.iv.toString("base64"),
    p_tag_b64: sealed.authTag.toString("base64"),
    p_key_version: 1,
  });
  if (error) throw error;
}

/** Existência de uma credencial (boolean), sem expor o valor. Usa service_role. */
export async function hasCredential(projectId: number, provider: Provider, kind: Kind): Promise<boolean> {
  const supa = getSupabaseAdmin();
  const { data } = await supa
    .from("project_credentials")
    .select("id")
    .eq("project_id", projectId)
    .eq("provider", provider)
    .eq("kind", kind)
    .maybeSingle();
  return !!data;
}

export async function getProjectCredential(
  projectId: number,
  provider: Provider,
  kind: Kind,
): Promise<string | null> {
  const supa = getSupabaseAdmin();
  const { data, error } = await supa.rpc("get_project_credential", {
    p_project_id: projectId,
    p_provider: provider,
    p_kind: kind,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return decryptSecret({
    ciphertext: Buffer.from(row.ciphertext_b64 as string, "base64"),
    iv: Buffer.from(row.iv_b64 as string, "base64"),
    authTag: Buffer.from(row.auth_tag_b64 as string, "base64"),
  });
}
