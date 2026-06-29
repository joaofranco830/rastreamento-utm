import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * RBAC server-side (ADR-v3-6). As checagens de papel são reforçadas no BACKEND
 * (Server Actions/RPC), não só ocultando botões. Owner = o dono da agência
 * (vê/gere tudo). Papel por par usuário↔projeto: admin/funcionario/cliente.
 */

export async function requireUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

export async function isOwner(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("app_is_owner");
  return data === true;
}

/** Papel do usuário no projeto: 'owner' | 'admin' | 'funcionario' | 'cliente' | null. */
export async function roleInProject(projectId: number): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("app_role_in", { p_project_id: projectId });
  return (data as string | null) ?? null;
}

/**
 * Garante que o usuário tem um dos papéis exigidos no projeto (owner sempre
 * passa). Lança em caso contrário — use no início de toda Server Action sensível.
 */
export async function requireRole(projectId: number, roles: string[]): Promise<string> {
  const role = await roleInProject(projectId);
  if (!role || !(role === "owner" || roles.includes(role))) {
    throw new Error("forbidden: papel insuficiente para esta ação");
  }
  return role;
}
