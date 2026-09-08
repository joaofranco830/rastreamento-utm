"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncHistoryAction } from "./actions";

const OPTIONS = [
  { d: 90, l: "90 dias" },
  { d: 180, l: "6 meses" },
  { d: 365, l: "1 ano" },
  { d: 730, l: "2 anos" },
];

/**
 * Puxa o histórico do Meta para uma janela maior. Reaproveita o token/contas
 * já guardados — útil quando o dashboard pede um período > 90 dias.
 */
export function SyncHistory() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [days, setDays] = useState(365);
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    setMsg(null);
    start(async () => {
      const r = await syncHistoryAction(days);
      if (!r.ok) {
        setMsg(r.error ?? "Falha ao sincronizar.");
        return;
      }
      setMsg(`Histórico sincronizado ✓ (${r.insights ?? 0} linhas). Já aparece ao selecionar o período no dashboard.`);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-400">Puxar histórico:</span>
      <select
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
        disabled={pending}
        className="rounded-lg border border-black/[.12] bg-transparent px-2 py-1.5 text-xs dark:border-white/[.18]"
      >
        {OPTIONS.map((o) => (
          <option key={o.d} value={o.d}>
            {o.l}
          </option>
        ))}
      </select>
      <button
        onClick={run}
        disabled={pending}
        className="rounded-lg border border-black/[.12] px-3 py-1.5 text-xs font-medium hover:bg-black/[.03] disabled:opacity-50 dark:border-white/[.18] dark:hover:bg-white/[.05]"
      >
        {pending ? "Sincronizando…" : "Sincronizar"}
      </button>
      {msg && <span className="w-full text-xs text-zinc-400">{msg}</span>}
    </div>
  );
}
