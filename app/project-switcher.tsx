"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActiveProjectAction } from "./project-actions";

/** Seletor de projeto global (USR-05). Só aparece quando há projeto visível. */
export default function ProjectSwitcher({
  projects,
  active,
}: {
  projects: { id: number; name: string }[];
  active: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (projects.length === 0) return null;

  return (
    <select
      aria-label="Projeto ativo"
      value={active ?? ""}
      disabled={pending}
      onChange={(e) => {
        const next = Number(e.target.value);
        startTransition(async () => {
          await setActiveProjectAction(next);
          // Re-renderiza TODA a rota atual com o novo projeto (senão a tela fica
          // com os dados do projeto anterior até um reload manual).
          router.refresh();
        });
      }}
      className="rounded-lg border border-black/[.1] bg-transparent px-2.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.14] dark:text-zinc-200 dark:hover:bg-white/[.06]"
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
