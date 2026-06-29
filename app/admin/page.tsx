import { redirect } from "next/navigation";
import { requireUser, isOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import Shell from "../shell";
import AdminPanel from "./admin-panel";

export const dynamic = "force-dynamic";

/** Administração global (owner): CRUD de projeto/usuário + gestão de membros. */
export default async function AdminPage() {
  await requireUser();
  if (!(await isOwner())) redirect("/central");

  const admin = getSupabaseAdmin();
  const [{ data: projects }, { data: members }, usersRes, { data: appUsers }] = await Promise.all([
    admin.from("projects").select("id, name, niche_tag, status").order("id"),
    admin.from("project_members").select("project_id, user_id, role"),
    admin.auth.admin.listUsers(),
    admin.from("app_users").select("id, full_name, is_owner"),
  ]);

  const emailById = new Map((usersRes.data?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const users = (appUsers ?? []).map((u) => ({
    id: u.id as string,
    email: emailById.get(u.id) ?? "",
    name: (u.full_name as string | null) ?? "",
    is_owner: !!u.is_owner,
  }));

  return (
    <Shell active="/admin">
      <div className="mx-auto w-full max-w-4xl">
        <AdminPanel projects={projects ?? []} members={(members ?? []) as never} users={users} />
      </div>
    </Shell>
  );
}
