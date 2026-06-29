"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser, isOwner, requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Ações de Admin (V3-4). Criação de projeto/usuário = owner; membros = admin. */

async function ensureOwner(): Promise<boolean> {
  await requireUser();
  return isOwner();
}

const ROLES = ["admin", "funcionario", "cliente"];
const newKey = () => randomUUID().replace(/-/g, "");

export async function createProjectAction(name: string, niche: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await ensureOwner())) return { ok: false, error: "Só o owner pode criar projetos." };
  if (!name.trim()) return { ok: false, error: "Nome obrigatório." };
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("projects")
    .insert({ name: name.trim(), niche_tag: niche.trim() || null })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Falha ao criar." };
  // Gera as chaves de roteamento do novo projeto (pixel + webhook).
  await admin.from("project_pixels").insert({ project_id: data.id, pixel_key: newKey() });
  await admin.from("project_endpoints").insert({ project_id: data.id, provider: "hotmart", endpoint_key: newKey() });
  revalidatePath("/admin");
  return { ok: true };
}

export async function createUserAction(
  email: string,
  password: string,
  fullName: string,
  projectId: number | null,
  role: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await ensureOwner())) return { ok: false, error: "Só o owner pode criar usuários." };
  if (!email.trim() || password.length < 6) return { ok: false, error: "E-mail e senha (≥6 caracteres) são obrigatórios." };
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName.trim() },
  });
  if (error || !data.user) return { ok: false, error: error?.message ?? "Falha ao criar usuário." };
  await admin
    .from("app_users")
    .upsert({ id: data.user.id, full_name: fullName.trim() || email.trim(), is_owner: false, status: "active" });
  if (projectId && ROLES.includes(role)) {
    await admin.from("project_members").insert({ project_id: projectId, user_id: data.user.id, role });
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function addMemberAction(projectId: number, userId: string, role: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole(projectId, ["admin"]);
  } catch {
    return { ok: false, error: "Só admin/owner pode gerenciar membros." };
  }
  if (!ROLES.includes(role)) return { ok: false, error: "Papel inválido." };
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("project_members")
    .upsert({ project_id: projectId, user_id: userId, role }, { onConflict: "project_id,user_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function removeMemberAction(projectId: number, userId: string): Promise<{ ok: boolean }> {
  try {
    await requireRole(projectId, ["admin"]);
  } catch {
    return { ok: false };
  }
  const admin = getSupabaseAdmin();
  await admin.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId);
  revalidatePath("/admin");
  return { ok: true };
}
