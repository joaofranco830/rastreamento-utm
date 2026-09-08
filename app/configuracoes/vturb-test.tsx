"use client";

import { useState, useTransition } from "react";
import { testVturbConnection } from "./integracoes-actions";

/** Botão "Testar conexão": chama /players/list e mostra os vídeos encontrados. */
export function VturbTestButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string; players?: { id: string; name: string }[] } | null>(null);

  return (
    <div className="mt-4">
      <button
        onClick={() => start(async () => setResult(await testVturbConnection()))}
        disabled={pending}
        className="rounded-lg border border-black/[.14] px-3 py-2 text-sm font-medium hover:bg-black/[.03] disabled:opacity-50 dark:border-white/[.2] dark:hover:bg-white/[.06]"
      >
        {pending ? "Testando…" : "Testar conexão"}
      </button>

      {result && !result.ok && (
        <p className="mt-2 text-sm text-[#ff5a5a]">{result.error}</p>
      )}
      {result && result.ok && (
        <div className="mt-2 text-sm">
          <p className="text-emerald-600 dark:text-emerald-400">Conectado ✓ — {result.players?.length ?? 0} vídeo(s) na conta.</p>
          {result.players && result.players.length > 0 && (
            <ul className="mt-1 max-h-40 overflow-y-auto text-xs text-zinc-400">
              {result.players.map((p) => (
                <li key={p.id} className="truncate">• {p.name} <span className="text-zinc-500">({p.id})</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
