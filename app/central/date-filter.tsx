"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";

const PRESETS = [7, 14, 30, 90];

export default function DateFilter({
  from,
  to,
  dias,
}: {
  from: string;
  to: string;
  dias: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [cFrom, setCFrom] = useState(from);
  const [cTo, setCTo] = useState(to);

  function applyPreset(d: number) {
    router.push(`${pathname}?dias=${d}`);
  }
  function applyCustom() {
    if (cFrom && cTo) router.push(`${pathname}?from=${cFrom}&to=${cTo}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <button
          key={p}
          onClick={() => applyPreset(p)}
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            dias === p
              ? "border-transparent bg-foreground text-background"
              : "border-black/[.12] hover:bg-black/[.04] dark:border-white/[.2] dark:hover:bg-white/[.06]"
          }`}
        >
          {p} dias
        </button>
      ))}
      <div className="flex items-center gap-1.5 rounded-lg border border-black/[.12] px-2 py-1 dark:border-white/[.2]">
        <input
          type="date"
          value={cFrom}
          onChange={(e) => setCFrom(e.target.value)}
          className="bg-transparent text-sm outline-none"
          aria-label="Data inicial"
        />
        <span className="text-zinc-400">→</span>
        <input
          type="date"
          value={cTo}
          onChange={(e) => setCTo(e.target.value)}
          className="bg-transparent text-sm outline-none"
          aria-label="Data final"
        />
        <button
          onClick={applyCustom}
          className="rounded-md bg-foreground px-2 py-0.5 text-xs font-medium text-background"
        >
          ok
        </button>
      </div>
    </div>
  );
}
