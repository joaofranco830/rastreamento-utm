"use client";

import { useState } from "react";

const PRESETS = [10, 20, 50, 100];

/** Seletor de quantas linhas mostrar: presets + valor personalizado. */
export default function RowLimit({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [custom, setCustom] = useState(!PRESETS.includes(value));
  return (
    <div className="inline-flex items-center gap-1">
      <select
        value={custom ? "custom" : String(value)}
        onChange={(e) => {
          if (e.target.value === "custom") setCustom(true);
          else {
            setCustom(false);
            onChange(Number(e.target.value));
          }
        }}
        className="rounded-lg border border-white/[.18] bg-[var(--noite-2)] px-2 py-2 text-sm text-zinc-200"
      >
        {PRESETS.map((n) => (
          <option key={n} value={n}>{n} linhas</option>
        ))}
        <option value="custom">Personalizado…</option>
      </select>
      {custom && (
        <input
          type="number"
          min={1}
          max={500}
          defaultValue={value}
          onChange={(e) => onChange(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
          className="w-20 rounded-lg border border-white/[.18] bg-transparent px-2 py-2 text-sm text-zinc-200"
          aria-label="Quantidade de linhas"
        />
      )}
    </div>
  );
}
