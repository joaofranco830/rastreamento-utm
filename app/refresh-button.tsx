"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshMeta } from "./actions";

export default function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function handleClick() {
    setMsg(null);
    startTransition(async () => {
      const r = await refreshMeta();
      setMsg(r.ok ? "Atualizado ✓" : r.skipped ? "Sync já em andamento" : "Falhou");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={pending}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Atualizando…" : "Atualizar Meta"}
      </button>
      {msg && <span className="text-xs text-zinc-500">{msg}</span>}
    </div>
  );
}
