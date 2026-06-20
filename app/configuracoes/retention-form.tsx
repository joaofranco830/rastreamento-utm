"use client";

import { useState, useTransition } from "react";
import { saveRetention } from "./actions";

export default function RetentionForm({ initialDays }: { initialDays: number }) {
  const [days, setDays] = useState(String(initialDays));
  const [saved, setSaved] = useState(initialDays);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = Number(days);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650;
  const dirty = parsed !== saved;

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveRetention(parsed);
      if (res.ok) {
        setSaved(parsed);
        setMsg("Salvo ✓");
      } else {
        setMsg(res.error ?? "Erro ao salvar");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={3650}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="w-24 rounded-lg border border-black/[.12] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground dark:border-white/[.2]"
        />
        <span className="text-sm text-zinc-500">dias</span>
      </div>
      <p className="text-xs text-zinc-500">
        Janela de retenção dos <b>eventos brutos</b> de navegação. Vendas e os agregados diários{" "}
        <b>nunca</b> são apagados — o gráfico temporal de meses continua inteiro. A poda de fato só
        liga na Fase V2-7.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending || !dirty || !valid}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "Salvando…" : "Salvar retenção"}
        </button>
        {!valid && <span className="text-xs text-amber-600">use um número de 1 a 3650</span>}
        {valid && msg && <span className="text-xs text-zinc-500">{msg}</span>}
      </div>
    </div>
  );
}
