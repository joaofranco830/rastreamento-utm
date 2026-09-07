import "server-only";
import { getProjectCredential } from "@/lib/credentials";
import { envMetaCreds, type MetaCreds } from "@/lib/meta/client";

const DEFAULT_PROJECT_ID = 1;

/** Credenciais do Meta de um projeto: cofre primeiro; o Projeto Padrão cai no .env. */
export async function getProjectMetaCreds(projectId: number): Promise<MetaCreds | null> {
  const token = await getProjectCredential(projectId, "meta", "token").catch(() => null);
  const account = await getProjectCredential(projectId, "meta", "account_id").catch(() => null);
  if (token && account) return { token, account };
  if (projectId === DEFAULT_PROJECT_ID) return envMetaCreds();
  return null;
}
