"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { migrateEnvMetaToVaultAction } from "./actions";

/**
 * Botão de MIGRAÇÃO ÚNICA: traz o Meta que ainda esteja no .env global para o
 * cofre DESTE projeto. Aparece só quando o projeto não tem Meta conectado.
 * Some assim que o cofre for populado (o projeto passa a "conectado").
 */
export function MigrateEnvMeta() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    setMsg(null);
    start(async () => {
      const r = await migrateEnvMetaToVaultAction();
      if (!r.ok) {
        setMsg(r.error ?? "Falha.");
      } else if (r.migrated) {
        setMsg(`Migrado ✓ — conta act_${r.account} agora no cofre deste projeto${r.synced ? " (sincronizado)" : ""}. Já pode apagar as variáveis do .env na Vercel.`);
        router.refresh();
      } else {
        setMsg(r.error ?? "Nada para migrar.");
      }
    });
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-400/10 p-4">
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
        Meta ainda no ambiente global (.env)?
      </p>
      <p className="mt-0.5 mb-3 text-xs text-zinc-500 dark:text-zinc-400">
        Se este projeto usava a conta de Meta que estava nas variáveis globais, clique para trazê-la (token + conta) para o
        cofre <strong>deste projeto</strong>. Uso único — depois apague <code>META_ACCESS_TOKEN</code>/<code>META_AD_ACCOUNT_ID</code> da Vercel.
      </p>
      <button
        onClick={run}
        disabled={pending}
        className="rounded-lg border border-amber-500/40 bg-amber-400/20 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-400/30 disabled:opacity-50 dark:text-amber-100"
      >
        {pending ? "Migrando…" : "Migrar Meta do .env para este projeto"}
      </button>
      {msg && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{msg}</p>}
    </div>
  );
}
