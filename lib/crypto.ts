import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Cofre de credenciais — AES-256-GCM (ADR-v3-7 / 7a).
 *
 * A chave-mestra (32 bytes) vem do Supabase Vault via RPC `app_get_master_key`
 * (server-only, service_role), com fallback para `process.env.CREDENTIALS_MASTER_KEY`
 * caso um dia seja adicionada na Vercel. NUNCA chega ao client. Usada só em
 * caminhos server-side fora do dashboard (sync/webhook/admin).
 */

let cachedKey: Buffer | null = null;

async function getMasterKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  // 1) Fallback por env (se algum dia for configurada na Vercel).
  let b64: string | null =
    process.env.CREDENTIALS_MASTER_KEY && process.env.CREDENTIALS_MASTER_KEY.length > 0
      ? process.env.CREDENTIALS_MASTER_KEY
      : null;

  // 2) Fonte padrão (v3): Supabase Vault.
  if (!b64) {
    const supa = getSupabaseAdmin();
    const { data, error } = await supa.rpc("app_get_master_key");
    if (error) throw new Error("crypto: falha ao ler a chave-mestra do Vault");
    b64 = (data as string | null) ?? null;
  }

  if (!b64) throw new Error("crypto: CREDENTIALS_MASTER_KEY ausente (env e Vault)");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("crypto: chave-mestra deve ter 32 bytes (base64)");
  cachedKey = key;
  return key;
}

export type Sealed = { ciphertext: Buffer; iv: Buffer; authTag: Buffer };

export async function encryptSecret(plaintext: string): Promise<Sealed> {
  const key = await getMasterKey();
  const iv = randomBytes(12); // nonce de 96 bits, recomendado para GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

export async function decryptSecret(sealed: Sealed): Promise<string> {
  const key = await getMasterKey();
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.iv);
  decipher.setAuthTag(sealed.authTag);
  const plaintext = Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
