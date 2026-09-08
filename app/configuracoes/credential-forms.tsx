"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveHottokAction, saveMetaAction } from "./integracoes-actions";

function Configured({ on }: { on: boolean }) {
  return (
    <span className={`text-xs ${on ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
      {on ? "configurado ✓" : "pendente"}
    </span>
  );
}

export function HottokForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">Hottok</span>
        <Configured on={configured} />
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={configured ? "•••••••• (substituir)" : "cole o Hottok da Hotmart"}
          className="min-w-0 flex-1 rounded-lg border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
        />
        <button
          onClick={() =>
            start(async () => {
              const r = await saveHottokAction(value);
              setMsg(r.ok ? "Salvo ✓" : r.error ?? "Falha.");
              if (r.ok) {
                setValue("");
                router.refresh();
              }
            })
          }
          disabled={pending}
          className="shrink-0 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          Salvar
        </button>
      </div>
      {msg && <span className="text-xs text-zinc-400">{msg}</span>}
    </div>
  );
}

export function MetaForm({ tokenSet, accountSet }: { tokenSet: boolean; accountSet: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [token, setToken] = useState("");
  const [account, setAccount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium">Token</span>
        <Configured on={tokenSet} />
        <span className="font-medium">Conta</span>
        <Configured on={accountSet} />
      </div>
      <input
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder={tokenSet ? "•••••••• (substituir token)" : "token do System User (Meta)"}
        className="rounded-lg border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
      />
      <div className="flex gap-2">
        <input
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          placeholder={accountSet ? "act_… (substituir conta)" : "ID da conta de anúncio (act_…)"}
          className="min-w-0 flex-1 rounded-lg border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
        />
        <button
          onClick={() =>
            start(async () => {
              const r = await saveMetaAction(token, account);
              setMsg(r.ok ? "Salvo ✓" : r.error ?? "Falha.");
              if (r.ok) {
                setToken("");
                setAccount("");
                router.refresh();
              }
            })
          }
          disabled={pending}
          className="shrink-0 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          Salvar
        </button>
      </div>
      {msg && <span className="text-xs text-zinc-400">{msg}</span>}
    </div>
  );
}
