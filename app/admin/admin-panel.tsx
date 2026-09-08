"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createProjectAction,
  createUserAction,
  addMemberAction,
  removeMemberAction,
} from "./actions";

interface Project { id: number; name: string; niche_tag: string | null; status: string }
interface Member { project_id: number; user_id: string; role: string }
interface UserRow { id: string; email: string; name: string; is_owner: boolean }

const ROLE_OPTS = [
  { v: "admin", l: "Admin" },
  { v: "funcionario", l: "Funcionário" },
  { v: "cliente", l: "Cliente" },
];
const input = "rounded-lg border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]";
const btn = "rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50";

export default function AdminPanel({ projects, members, users }: { projects: Project[]; members: Member[]; users: UserRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? okMsg : r.error ?? "Falha.");
      if (r.ok) router.refresh();
    });

  // Criar projeto
  const [pName, setPName] = useState("");
  const [pNiche, setPNiche] = useState("");
  // Criar usuário
  const [uEmail, setUEmail] = useState("");
  const [uPass, setUPass] = useState("");
  const [uName, setUName] = useState("");
  const [uProj, setUProj] = useState<string>("");
  const [uRole, setURole] = useState("cliente");
  // Add member
  const [amProj, setAmProj] = useState<Record<number, string>>({});
  const [amRole, setAmRole] = useState<Record<number, string>>({});

  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? `${u.name || u.email}${u.is_owner ? " (owner)" : ""}` : id.slice(0, 8);
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Administração global</h1>
        <p className="text-sm text-zinc-400">Projetos, usuários e membros — só o owner.</p>
        {msg && <p className="mt-2 text-sm text-zinc-400">{msg}</p>}
      </div>

      {/* Criar projeto */}
      <section className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.12]">
        <h2 className="mb-3 text-sm font-medium">Novo projeto</h2>
        <div className="flex flex-wrap gap-2">
          <input className={`${input} min-w-0 flex-1`} placeholder="Nome do cliente/projeto" value={pName} onChange={(e) => setPName(e.target.value)} />
          <input className={input} placeholder="nicho (opcional)" value={pNiche} onChange={(e) => setPNiche(e.target.value)} />
          <button className={btn} disabled={pending} onClick={() => run(() => createProjectAction(pName, pNiche), "Projeto criado ✓")}>Criar</button>
        </div>
      </section>

      {/* Criar usuário */}
      <section className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.12]">
        <h2 className="mb-3 text-sm font-medium">Novo usuário</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input className={input} placeholder="e-mail" value={uEmail} onChange={(e) => setUEmail(e.target.value)} />
          <input className={input} type="password" placeholder="senha (≥6)" value={uPass} onChange={(e) => setUPass(e.target.value)} />
          <input className={input} placeholder="nome" value={uName} onChange={(e) => setUName(e.target.value)} />
          <div className="flex gap-2">
            <select className={`${input} flex-1`} value={uProj} onChange={(e) => setUProj(e.target.value)}>
              <option value="">— sem projeto —</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
            <select className={input} value={uRole} onChange={(e) => setURole(e.target.value)}>
              {ROLE_OPTS.map((r) => (<option key={r.v} value={r.v}>{r.l}</option>))}
            </select>
          </div>
        </div>
        <button
          className={`${btn} mt-3`}
          disabled={pending}
          onClick={() => run(() => createUserAction(uEmail, uPass, uName, uProj ? Number(uProj) : null, uRole), "Usuário criado ✓ (repasse a senha)")}
        >
          Criar usuário
        </button>
        <p className="mt-2 text-xs text-zinc-400">Sem convite por e-mail: você cria o login e repassa as credenciais.</p>
      </section>

      {/* Projetos + membros */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-400">Projetos &amp; membros</h2>
        {projects.map((p) => {
          const mem = members.filter((m) => m.project_id === p.id);
          const nonMembers = users.filter((u) => !u.is_owner && !mem.some((m) => m.user_id === u.id));
          return (
            <div key={p.id} className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.12]">
              <p className="font-medium">{p.name} <span className="text-xs text-zinc-400">#{p.id} · {p.status}</span></p>
              <div className="mt-3 flex flex-col gap-1.5">
                {mem.length === 0 && <span className="text-xs text-zinc-400">Sem membros.</span>}
                {mem.map((m) => (
                  <div key={m.user_id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{nameOf(m.user_id)} · <span className="text-zinc-400">{m.role}</span></span>
                    <button className="text-xs text-zinc-400 hover:text-red-500" disabled={pending} onClick={() => run(() => removeMemberAction(p.id, m.user_id), "Membro removido ✓")}>remover</button>
                  </div>
                ))}
              </div>
              {nonMembers.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-black/[.06] pt-3 dark:border-white/[.08]">
                  <select className={`${input} min-w-0 flex-1`} value={amProj[p.id] ?? ""} onChange={(e) => setAmProj((s) => ({ ...s, [p.id]: e.target.value }))}>
                    <option value="">+ adicionar membro…</option>
                    {nonMembers.map((u) => (<option key={u.id} value={u.id}>{u.name || u.email}</option>))}
                  </select>
                  <select className={input} value={amRole[p.id] ?? "cliente"} onChange={(e) => setAmRole((s) => ({ ...s, [p.id]: e.target.value }))}>
                    {ROLE_OPTS.map((r) => (<option key={r.v} value={r.v}>{r.l}</option>))}
                  </select>
                  <button
                    className={btn}
                    disabled={pending || !amProj[p.id]}
                    onClick={() => run(() => addMemberAction(p.id, amProj[p.id], amRole[p.id] ?? "cliente"), "Membro adicionado ✓")}
                  >
                    Adicionar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
