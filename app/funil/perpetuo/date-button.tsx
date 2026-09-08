"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Data de hoje no fuso do negócio (America/Sao_Paulo) como YYYY-MM-DD. */
function todaySP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
/** Aritmética de datas em UTC-meia-noite (evita DST). Entrada/saída YYYY-MM-DD. */
function parse(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
function fmt(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}
function addDays(d: string, n: number): string {
  const dt = parse(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmt(dt);
}
function addMonths(d: string, n: number): string {
  const dt = parse(d);
  dt.setUTCMonth(dt.getUTCMonth() + n);
  return fmt(dt);
}
function startOfMonth(d: string): string {
  const dt = parse(d);
  return fmt(new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1)));
}
function endOfMonth(d: string): string {
  const dt = parse(d);
  return fmt(new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)));
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WD = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

interface Preset {
  key: string;
  label: string;
  range: () => [string, string];
}

function presets(): Preset[] {
  const t = todaySP();
  return [
    { key: "today", label: "Hoje", range: () => [t, t] },
    { key: "yesterday", label: "Ontem", range: () => [addDays(t, -1), addDays(t, -1)] },
    { key: "7d", label: "Últimos 7 dias", range: () => [addDays(t, -7), addDays(t, -1)] },
    { key: "14d", label: "Últimos 14 dias", range: () => [addDays(t, -14), addDays(t, -1)] },
    { key: "30d", label: "Últimos 30 dias", range: () => [addDays(t, -30), addDays(t, -1)] },
    { key: "this_month", label: "Este mês", range: () => [startOfMonth(t), t] },
    { key: "last_month", label: "Mês passado", range: () => [startOfMonth(addMonths(t, -1)), endOfMonth(addMonths(t, -1))] },
    { key: "this_year", label: "Este ano", range: () => [`${t.slice(0, 4)}-01-01`, t] },
    { key: "12m", label: "Últimos 12 meses", range: () => [addMonths(t, -12), t] },
    { key: "max", label: "Máximo", range: () => [addMonths(t, -36), t] },
  ];
}

/** Efetivo a partir da URL, espelhando resolveRange do servidor. */
function effRange(qFrom: string | null, qTo: string | null, qDias: string | null): [string, string] {
  const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const t = todaySP();
  if (isDate(qFrom) && isDate(qTo)) return qFrom! <= qTo! ? [qFrom!, qTo!] : [qTo!, qFrom!];
  const n = Number(qDias);
  const dias = Number.isInteger(n) && n >= 1 && n <= 730 ? n : 14;
  return [addDays(t, -(dias - 1)), t];
}

function shortLabel(d: string): string {
  const dt = parse(d);
  return `${dt.getUTCDate()} ${MONTHS_SHORT[dt.getUTCMonth()]}`;
}

function Calendar({ month, start, end, onPick }: { month: string; start: string | null; end: string | null; onPick: (d: string) => void }) {
  const first = startOfMonth(month);
  const dt = parse(first);
  const year = dt.getUTCFullYear();
  const mon = dt.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, mon + 1, 0)).getUTCDate();
  // segunda = 0
  const lead = (new Date(Date.UTC(year, mon, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(fmt(new Date(Date.UTC(year, mon, d))));

  return (
    <div>
      <p className="mb-2 text-center text-sm font-medium capitalize text-foreground">{MONTHS[mon]} {year}</p>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] text-zinc-500">
        {WD.map((w) => <div key={w} className="py-1">{w}</div>)}
        {cells.map((c, i) => {
          if (!c) return <div key={i} />;
          const inRange = start && end && c >= start && c <= end;
          const edge = c === start || c === end;
          const day = parse(c).getUTCDate();
          return (
            <button
              key={i}
              onClick={() => onPick(c)}
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-xs transition-colors ${
                edge ? "bg-eletrico font-medium text-white" : inRange ? "bg-eletrico/20 text-eletrico-cl" : "text-zinc-300 hover:bg-white/[.08]"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DateButton() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const [eFrom, eTo] = effRange(sp.get("from"), sp.get("to"), sp.get("dias"));
  const PRESETS = useMemo(() => presets(), []);

  const [start, setStart] = useState<string>(eFrom);
  const [end, setEnd] = useState<string | null>(eTo);
  const [view, setView] = useState(startOfMonth(eTo));

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // rótulo do botão
  const matched = PRESETS.find((p) => {
    const [a, b] = p.range();
    return a === eFrom && b === eTo;
  });
  const label = matched ? matched.label : `${shortLabel(eFrom)} – ${shortLabel(eTo)}`;

  function openMenu() {
    setStart(eFrom);
    setEnd(eTo);
    setView(startOfMonth(eTo));
    setOpen(true);
  }

  function pickPreset(p: Preset) {
    const [a, b] = p.range();
    setStart(a);
    setEnd(b);
    setView(startOfMonth(b));
  }

  function pickDay(d: string) {
    if (!start || (start && end)) {
      setStart(d);
      setEnd(null);
    } else if (d < start) {
      setStart(d);
    } else {
      setEnd(d);
    }
  }

  function apply() {
    const from = start;
    const to = end ?? start;
    const params = new URLSearchParams(sp.toString());
    params.delete("dias");
    params.set("from", from);
    params.set("to", to);
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="inline-flex items-center gap-2 rounded-lg border border-white/[.18] px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[.06]"
      >
        <span aria-hidden>📅</span>
        <span>{label}</span>
        <span className="text-zinc-500" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 flex w-[min(92vw,640px)] flex-col rounded-2xl border border-white/[.14] bg-[var(--noite-2)] shadow-2xl sm:flex-row">
          {/* presets */}
          <div className="max-h-[360px] shrink-0 overflow-y-auto border-b border-white/[.08] p-2 sm:w-52 sm:border-b-0 sm:border-r">
            {PRESETS.map((p) => {
              const [a, b] = p.range();
              const active = a === start && b === end;
              return (
                <button
                  key={p.key}
                  onClick={() => pickPreset(p)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${active ? "bg-eletrico/15 font-medium text-eletrico-cl" : "text-zinc-300 hover:bg-white/[.06]"}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* calendário + ações */}
          <div className="min-w-0 flex-1 p-3">
            <div className="mb-2 flex items-center justify-between">
              <button onClick={() => setView(addMonths(view, -1))} className="rounded-lg px-2 py-1 text-zinc-400 hover:bg-white/[.06]">‹</button>
              <button onClick={() => setView(addMonths(view, 1))} className="rounded-lg px-2 py-1 text-zinc-400 hover:bg-white/[.06]">›</button>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Calendar month={view} start={start} end={end} onPick={pickDay} />
              <div className="hidden sm:block">
                <Calendar month={addMonths(view, 1)} start={start} end={end} onPick={pickDay} />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[.08] pt-3">
              <div className="text-xs text-zinc-400">
                {start ? shortLabel(start) : "—"} <span className="text-zinc-400">→</span> {end ? shortLabel(end) : (start ? "selecione o fim" : "—")}
                <span className="ml-2 text-zinc-400">· Fuso: São Paulo</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setOpen(false)} className="rounded-lg border border-white/[.16] px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/[.06]">Cancelar</button>
                <button onClick={apply} disabled={!start} className="rounded-lg bg-lima px-4 py-1.5 text-sm font-bold text-[var(--noite)] disabled:opacity-50">Atualizar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
