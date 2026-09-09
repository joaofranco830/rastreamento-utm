import "server-only";
import { getProjectCredential } from "@/lib/credentials";
import { type MetaCreds } from "@/lib/meta/client";

/** Divide a lista de contas guardada (separada por vírgula) em ids limpos. */
export function parseAccounts(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^act_/, ""))
    .filter(Boolean);
}

/**
 * Credenciais do Meta de um projeto — SEMPRE do cofre do projeto, NUNCA de env
 * global. Cada projeto conecta o seu próprio Meta (isolamento por projeto).
 * Retorna null quando o projeto não tem Meta conectado.
 */
export async function getProjectMetaCreds(projectId: number): Promise<MetaCreds | null> {
  const token = await getProjectCredential(projectId, "meta", "token").catch(() => null);
  const accountRaw = await getProjectCredential(projectId, "meta", "account_id").catch(() => null);
  const accounts = parseAccounts(accountRaw);
  if (token && accounts.length > 0) return { token, accounts };
  return null;
}
