import "server-only";
import { getProjectCredential } from "@/lib/credentials";
import { envMetaCreds, type MetaCreds } from "@/lib/meta/client";

const DEFAULT_PROJECT_ID = 1;

/** Divide a lista de contas guardada (separada por vírgula) em ids limpos. */
export function parseAccounts(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^act_/, ""))
    .filter(Boolean);
}

/** Credenciais do Meta de um projeto: cofre primeiro; o Projeto Padrão cai no .env. */
export async function getProjectMetaCreds(projectId: number): Promise<MetaCreds | null> {
  const token = await getProjectCredential(projectId, "meta", "token").catch(() => null);
  const accountRaw = await getProjectCredential(projectId, "meta", "account_id").catch(() => null);
  const accounts = parseAccounts(accountRaw);
  if (token && accounts.length > 0) return { token, accounts };
  if (projectId === DEFAULT_PROJECT_ID) return envMetaCreds();
  return null;
}
