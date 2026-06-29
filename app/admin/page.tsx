import { redirect } from "next/navigation";
import { requireUser, isOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Shell from "../shell";

export const dynamic = "force-dynamic";

/**
 * Administração global (owner). Visão de TODOS os projetos e suas filiações.
 * Criação/gestão (CRUD de projeto/usuário) entra como ações nas próximas levas;
 * por ora é a visão consolidada que só o owner enxerga (USR-03 / PRJ-01).
 */
export default async function AdminPage() {
  await requireUser();
  if (!(await isOwner())) redirect("/central");

  const supabase = await createClient();
  const [{ data: projects }, { data: members }] = await Promise.all([
    supabase.from("projects").select("id, name, niche_tag, status, created_at").order("id"),
    supabase.from("project_members").select("project_id, role, app_users(full_name)").order("project_id"),
  ]);

  const byProject = new Map<number, { name: string; role: string }[]>();
  for (const m of (members ?? []) as {
    project_id: number;
    role: string;
    app_users: { full_name: string | null }[] | null;
  }[]) {
    const arr = byProject.get(m.project_id) ?? [];
    arr.push({ name: m.app_users?.[0]?.full_name ?? "—", role: m.role });
    byProject.set(m.project_id, arr);
  }

  return (
    <Shell active="/admin">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="mb-1 text-lg font-semibold tracking-tight">Administração global</h1>
        <p className="mb-6 text-sm text-zinc-500">
          Visão de todos os projetos e membros — visível só para o owner.
        </p>

        <div className="flex flex-col gap-3">
          {(projects ?? []).map((p) => (
            <div key={p.id} className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.12]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-zinc-400">
                    {p.niche_tag ? `${p.niche_tag} · ` : ""}#{p.id} · {p.status}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(byProject.get(p.id) ?? []).map((m, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-black/[.05] px-2.5 py-1 text-xs text-zinc-600 dark:bg-white/[.08] dark:text-zinc-300"
                  >
                    {m.name} · {m.role}
                  </span>
                ))}
                {(byProject.get(p.id) ?? []).length === 0 && (
                  <span className="text-xs text-zinc-400">Sem membros.</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-zinc-400">
          Criar projeto/usuário e gerenciar membros entram como ações nas próximas levas (USR-03/04, PRJ-01/04).
        </p>
      </div>
    </Shell>
  );
}
