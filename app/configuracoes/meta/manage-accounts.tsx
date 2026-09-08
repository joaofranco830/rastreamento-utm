"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listStoredAdAccountsAction, updateAdAccountsAction, type AdAccountOption } from "./actions";

/**
 * Gerenciador de contas de anúncio da BM já conectada: usa o token GUARDADO
 * no cofre para listar as contas e ajustar a seleção — sem colar o token de novo.
 */
export function ManageAccounts() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<AdAccountOption[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function load() {
    setMsg(null);
    setSaved(false);
    setOpen(true);
    start(async () => {
      const r = await listStoredAdAccountsAction();
      if (!r.ok || !r.accounts) {
        setMsg(r.error ?? "Falha ao carregar as contas.");
        setAccounts([]);
        return;
      }
      setAccounts(r.accounts);
      setSelected(r.selected ?? []);
    });
  }

  function toggle(id: string) {
    setSaved(false);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await updateAdAccountsAction(selected);
      if (!r.ok) {
        setMsg(r.error ?? "Falha ao salvar.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={load}
        className="rounded-lg border border-black/[.12] px-3 py-1.5 text-xs font-medium hover:bg-black/[.03] dark:border-white/[.18] dark:hover:bg-white/[.05]"
      >
        Escolher contas de anúncio
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-black/[.1] p-3 dark:border-white/[.14]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Marque as contas que alimentam este projeto (token guardado — não precisa colar de novo).
        </p>
        <button onClick={() => setOpen(false)} className="text-xs text-zinc-400 hover:underline">
          fechar
        </button>
      </div>

      {accounts === null ? (
        <p className="py-3 text-center text-xs text-zinc-400">Carregando contas…</p>
      ) : accounts.length === 0 ? (
        <p className="py-2 text-xs text-amber-600 dark:text-amber-400">{msg ?? "Nenhuma conta encontrada."}</p>
      ) : (
        <>
          {accounts.length > 1 && (
            <div className="mb-2 flex gap-3 text-xs">
              <button onClick={() => setSelected(accounts.map((a) => a.id))} className="text-zinc-400 hover:underline">
                Marcar todas
              </button>
              <button onClick={() => setSelected([])} className="text-zinc-400 hover:underline">
                Limpar
              </button>
            </div>
          )}
          <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {accounts.map((a) => (
              <label
                key={a.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                  selected.includes(a.id)
                    ? "border-foreground bg-black/[.03] dark:bg-white/[.05]"
                    : "border-black/[.08] dark:border-white/[.12]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={() => toggle(a.id)}
                  className="accent-current"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.name || "(sem nome)"}</span>
                  <span className="block font-mono text-xs text-zinc-400">act_{a.id}</span>
                </span>
              </label>
            ))}
          </div>

          {msg && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{msg}</p>}
          {saved && !msg && (
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
              Seleção salva ✓ — sincronizando os dados das contas.
            </p>
          )}

          <div className="mt-3 flex justify-end">
            <button
              onClick={save}
              disabled={pending || selected.length === 0}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? "Salvando…" : `Salvar ${selected.length} ${selected.length === 1 ? "conta" : "contas"}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
