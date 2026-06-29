"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PRESETS = [
  { d: 7, l: "7 dias" },
  { d: 14, l: "14 dias" },
  { d: 30, l: "30 dias" },
  { d: 90, l: "90 dias" },
];

function spToday(offset = 0): string {
  const d = new Date(Date.now() - offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/** Botão único de calendário: mostra o período atual e abre o menu de presets + custom. */
export default function DateButton() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const qFrom = sp.get("from");
  const qTo = sp.get("to");
  const qDias = Number(sp.get("dias"));
  const custom = isDate(qFrom) && isDate(qTo);
  const dias = [7, 14, 30, 90].includes(qDias) ? qDias : custom ? null : 14;

  const [cf, setCf] = useState(custom ? qFrom! : spToday(13));
  const [ct, setCt] = useState(custom ? qTo! : spToday(0));

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(qs: string) {
    router.push(`${pathname}?${qs}`);
    setOpen(false);
  }

  const label = dias ? `${dias} dias` : `${qFrom} a ${qTo}`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-black/[.12] px-3 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.18] dark:hover:bg-white/[.06]"
      >
        <span aria-hidden>📅</span>
        <span>{label}</span>
        <span className="text-zinc-400" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-black/[.1] bg-background p-3 shadow-xl dark:border-white/[.14]">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.d}
                onClick={() => go(`dias=${p.d}`)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  dias === p.d
                    ? "bg-foreground text-background"
                    : "border border-black/[.1] hover:bg-black/[.04] dark:border-white/[.14] dark:hover:bg-white/[.06]"
                }`}
              >
                {p.l}
              </button>
            ))}
          </div>
          <div className="mt-3 border-t border-black/[.06] pt-3 dark:border-white/[.08]">
            <p className="mb-1.5 text-xs font-medium text-zinc-500">Período personalizado</p>
            <div className="flex items-center gap-2">
              <input type="date" value={cf} onChange={(e) => setCf(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-black/[.12] bg-transparent px-2 py-1.5 text-sm dark:border-white/[.18]" />
              <span className="text-zinc-400">→</span>
              <input type="date" value={ct} onChange={(e) => setCt(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-black/[.12] bg-transparent px-2 py-1.5 text-sm dark:border-white/[.18]" />
            </div>
            <button onClick={() => go(`from=${cf}&to=${ct}`)} className="mt-2 w-full rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background">
              Aplicar período
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
