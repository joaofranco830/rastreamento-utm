"use client";

import { useMemo, useState } from "react";
import {
  type FieldDef,
  type FieldFormat,
  type FormulaToken,
  type CustomMetric,
  FIELD_GROUPS,
  evalTokens,
  formatValue,
} from "@/lib/dashboard-metrics";

const OP_SYMBOL: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

const FORMAT_OPTIONS: { value: FieldFormat; label: string }[] = [
  { value: "number", label: "Numérico" },
  { value: "percent", label: "Porcentagem" },
  { value: "money", label: "Monetária" },
  { value: "multiplier", label: "Multiplicador (×)" },
];

function newId(): string {
  return "custom_" + Math.random().toString(36).slice(2, 8);
}

/** Uma métrica ainda em edição só pode ser salva se a fórmula for válida. */
function tokenLabel(t: FormulaToken, fields: FieldDef[]): string {
  if (t.kind === "field") return fields.find((f) => f.key === t.key)?.label ?? t.key;
  if (t.kind === "num") return String(t.value);
  if (t.kind === "op") return OP_SYMBOL[t.op] ?? t.op;
  if (t.kind === "lp") return "(";
  return ")";
}

export default function MetricFormulaBuilder({
  fields,
  values,
  initial,
  onSave,
  onClose,
}: {
  fields: FieldDef[];
  /** Valor atual de cada campo (para prévia ao vivo). */
  values: Record<string, number | null>;
  initial?: CustomMetric | null;
  onSave: (m: CustomMetric) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [format, setFormat] = useState<FieldFormat>(initial?.format ?? "number");
  const [formula, setFormula] = useState<FormulaToken[]>(initial?.formula ?? []);
  const [q, setQ] = useState("");

  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const byGroup = new Map<string, FieldDef[]>();
    for (const f of fields) {
      if (needle && !f.label.toLowerCase().includes(needle)) continue;
      const arr = byGroup.get(f.group) ?? [];
      arr.push(f);
      byGroup.set(f.group, arr);
    }
    // ordem: grupos fixos primeiro, "Por produto" e demais depois
    const order = [...FIELD_GROUPS, "Por produto"];
    return [...byGroup.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [fields, q]);

  const preview = useMemo(() => evalTokens(formula, (k) => values[k] ?? null), [formula, values]);
  const valid = formula.length > 0 && preview !== null;
  const canSave = name.trim().length > 0 && formula.length > 0;

  const push = (t: FormulaToken) => setFormula((f) => [...f, t]);
  const pop = () => setFormula((f) => f.slice(0, -1));

  function save() {
    if (!canSave) return;
    onSave({
      id: initial?.id ?? newId(),
      name: name.trim().slice(0, 60),
      format,
      formula,
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-white/[.12] bg-[var(--noite-2)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-foreground">{initial ? "EDITAR MÉTRICA" : "CRIAR MÉTRICA PERSONALIZADA"}</h3>
            <p className="text-xs text-aco">Monte uma fórmula selecionando dados e operadores.</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-white/[.14] px-2 py-1 text-sm text-zinc-400 hover:bg-white/[.06]">✕</button>
        </div>

        {/* nome + formato */}
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da métrica (ex.: Ticket do principal)"
            className="rounded-lg border border-white/[.14] bg-transparent px-3 py-2 text-sm text-foreground"
          />
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as FieldFormat)}
            className="rounded-lg border border-white/[.14] bg-[var(--noite-2)] px-3 py-2 text-sm text-foreground"
          >
            {FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* fórmula montada */}
        <div className="mb-2 min-h-[46px] rounded-lg border border-white/[.14] bg-white/[.02] p-2">
          {formula.length === 0 ? (
            <span className="text-xs text-aco">A fórmula aparece aqui. Selecione um dado abaixo para começar.</span>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {formula.map((t, i) => (
                <span
                  key={i}
                  className={`rounded-md px-2 py-1 text-xs ${
                    t.kind === "field"
                      ? "bg-eletrico/20 text-eletrico-cl"
                      : t.kind === "num"
                        ? "bg-white/[.08] text-foreground"
                        : "font-mono text-lima"
                  }`}
                >
                  {tokenLabel(t, fields)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* controles: operadores + número + apagar */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {(["+", "-", "*", "/"] as const).map((op) => (
            <button
              key={op}
              onClick={() => push({ kind: "op", op })}
              className="h-8 w-8 rounded-lg border border-white/[.14] text-sm text-foreground hover:bg-white/[.06]"
            >
              {OP_SYMBOL[op]}
            </button>
          ))}
          <button onClick={() => push({ kind: "lp" })} className="h-8 w-8 rounded-lg border border-white/[.14] text-sm text-foreground hover:bg-white/[.06]">(</button>
          <button onClick={() => push({ kind: "rp" })} className="h-8 w-8 rounded-lg border border-white/[.14] text-sm text-foreground hover:bg-white/[.06]">)</button>
          <NumberAdder onAdd={(v) => push({ kind: "num", value: v })} />
          <div className="ml-auto flex gap-1.5">
            <button onClick={pop} disabled={formula.length === 0} className="rounded-lg border border-white/[.14] px-2 py-1 text-xs text-zinc-300 hover:bg-white/[.06] disabled:opacity-40">⌫ Apagar</button>
            <button onClick={() => setFormula([])} disabled={formula.length === 0} className="rounded-lg border border-white/[.14] px-2 py-1 text-xs text-zinc-300 hover:bg-white/[.06] disabled:opacity-40">Limpar</button>
          </div>
        </div>

        {/* seletor de dados */}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar dado…"
          className="mb-2 w-full rounded-lg border border-white/[.14] bg-transparent px-3 py-2 text-sm"
        />
        <div className="max-h-[34vh] space-y-3 overflow-y-auto pr-1">
          {grouped.map(([group, list]) => (
            <div key={group}>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-aco">{group}</p>
              <div className="flex flex-wrap gap-1.5">
                {list.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => push({ kind: "field", key: f.key })}
                    title={f.label}
                    className="rounded-lg border border-white/[.12] bg-white/[.02] px-2.5 py-1.5 text-left text-xs text-foreground hover:border-eletrico hover:bg-eletrico/10"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {grouped.length === 0 && <p className="text-xs text-aco">Nenhum dado encontrado.</p>}
        </div>

        {/* prévia + salvar */}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[.08] pt-3">
          <div className="text-sm">
            <span className="text-aco">Prévia: </span>
            {formula.length === 0 ? (
              <span className="text-zinc-500">—</span>
            ) : valid ? (
              <span className="font-display text-foreground">{formatValue(preview, format)}</span>
            ) : (
              <span className="text-red-400">fórmula incompleta</span>
            )}
          </div>
          <button
            onClick={save}
            disabled={!canSave}
            className="rounded-lg bg-lima px-4 py-2 text-sm font-bold text-[var(--noite)] disabled:opacity-50"
          >
            {initial ? "Salvar alterações" : "Adicionar métrica"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NumberAdder({ onAdd }: { onAdd: (v: number) => void }) {
  const [v, setV] = useState("");
  return (
    <span className="flex items-center gap-1">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        inputMode="decimal"
        placeholder="nº"
        className="h-8 w-16 rounded-lg border border-white/[.14] bg-transparent px-2 text-xs text-foreground"
      />
      <button
        onClick={() => {
          const n = Number(v.replace(",", "."));
          if (isFinite(n)) onAdd(n);
          setV("");
        }}
        disabled={v.trim() === ""}
        className="h-8 rounded-lg border border-white/[.14] px-2 text-xs text-zinc-300 hover:bg-white/[.06] disabled:opacity-40"
      >
        + nº
      </button>
    </span>
  );
}
