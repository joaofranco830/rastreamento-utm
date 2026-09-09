"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDashboardAccountsAction } from "../funnel-actions";

interface Account {
  meta_account_id: string;
  name?: string | null;
  spend?: number;
}

/**
 * Seleção, POR FUNIL, de quais contas de anúncio (já sincronizadas no projeto)
 * entram no "investido"/ROAS do dashboard. Nenhuma marcada = todas.
 */
export default function AccountsFilter({
  accounts,
  selected: initial,
}: {
  accounts: Account[];
  selected: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Sem seleção salva = considerar todas marcadas.
  const [selected, setSelected] = useState<string[]>(
    initial.length > 0 ? initial : accounts.map((a) => a.meta_account_id),
  );
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(id: string) {
    setMsg(null);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function save() {
    setMsg(null);
    start(async () => {
      // Marcar todas = salvar vazio (= todas), pra não "congelar" contas novas de fora.
      const all = selected.length === accounts.length;
      const r = await saveDashboardAccountsAction(all ? [] : selected);
      setMsg(r.ok ? "Salvo ✓ (o dashboard já reflete)" : r.error ?? "Falha.");
      if (r.ok) router.refresh();
    });
  }

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        Nenhuma conta de anúncio sincronizada ainda. Conecte a BM em <strong>Configurar → Integração Meta</strong>.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3 text-xs">
        <button onClick={() => setSelected(accounts.map((a) => a.meta_account_id))} className="text-zinc-400 hover:underline">
          Marcar todas
        </button>
        <button onClick={() => setSelected([])} className="text-zinc-400 hover:underline">
          Limpar
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {accounts.map((a) => (
          <label
            key={a.meta_account_id}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
              selected.includes(a.meta_account_id)
                ? "border-foreground bg-black/[.03] dark:bg-white/[.05]"
                : "border-black/[.08] dark:border-white/[.12]"
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(a.meta_account_id)}
              onChange={() => toggle(a.meta_account_id)}
              className="accent-current"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{a.name?.trim() || `Conta ${a.meta_account_id}`}</span>
              <span className="font-mono text-[11px] text-zinc-400">act_{a.meta_account_id}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Salvando…" : "Salvar contas"}
        </button>
        {msg && <span className="text-xs text-zinc-400">{msg}</span>}
      </div>
      <p className="text-xs text-zinc-400">
        Só afeta o <strong>investido</strong>, ROAS e métricas do Meta. Faturamento e nº de vendas são do projeto inteiro (uma
        venda não é presa a uma conta de anúncio).
      </p>
    </div>
  );
}
