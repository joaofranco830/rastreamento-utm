import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Projeto ativo (USR-05). A lista vem sob RLS (sessão do usuário): owner vê
 * todos os projetos ativos; membro vê só os seus. O projeto ativo é guardado
 * num cookie e SEMPRE validado contra a filiação a cada request.
 */

export const ACTIVE_PROJECT_COOKIE = "fa_project";

export interface ProjectOption {
  id: number;
  name: string;
}

export async function getVisibleProjects(): Promise<ProjectOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name")
    .eq("status", "active")
    .order("id", { ascending: true });
  return (data ?? []) as ProjectOption[];
}

/** Projeto ativo: cookie (se ainda autorizado) ou o 1º visível. null se nenhum. */
export async function getActiveProjectId(): Promise<number | null> {
  const projects = await getVisibleProjects();
  if (projects.length === 0) return null;
  const allowed = new Set(projects.map((p) => p.id));
  const cookieStore = await cookies();
  const raw = cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value;
  const cid = raw ? Number(raw) : NaN;
  if (Number.isFinite(cid) && allowed.has(cid)) return cid;
  return projects[0].id;
}
