"use client";

import { useMemo, useRef, useState } from "react";
import { brl, mult } from "@/lib/format";

interface Point {
  day: string;
  invested: number;
  net_revenue: number;
  profit: number;
  roas: number | null;
}

interface Bucket {
  day: string; // início do balde (rótulo)
  end: string; // fim do balde
  invested: number;
  net_revenue: number;
  profit: number;
  roas: number | null;
}

type Gran = "day" | "week" | "month";

const W = 820,
  H = 340,
  PADL = 56,
  PADR = 48,
  PADT = 16,
  PADB = 36;

function brlShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const SERIES = [
  { key: "invested" as const, color: "#a1a1aa", label: "Gasto", money: true },
  { key: "net_revenue" as const, color: "#22c55e", label: "Faturamento", money: true },
  { key: "profit" as const, color: "#3b82f6", label: "Lucro", money: true },
  { key: "roas" as const, color: "#f59e0b", label: "ROAS", money: false },
];

/** Escolhe a granularidade pelo tamanho da janela e agrega os pontos.
 *  Janelas longas viram semanas/meses — senão o diário fica ilegível (comprimido). */
function bucketize(data: Point[]): { pts: Bucket[]; gran: Gran } {
  const n = data.length;
  const gran: Gran = n <= 62 ? "day" : n <= 186 ? "week" : "month";

  if (gran === "day") {
    return { pts: data.map((d) => ({ ...d, end: d.day })), gran };
  }

  const groups = new Map<string, Point[]>();
  const order: string[] = [];
  data.forEach((d, i) => {
    const key = gran === "month" ? d.day.slice(0, 7) : String(Math.floor(i / 7));
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(d);
  });

  const pts = order.map((key) => {
    const g = groups.get(key)!;
    const invested = g.reduce((a, d) => a + Number(d.invested || 0), 0);
    const net_revenue = g.reduce((a, d) => a + Number(d.net_revenue || 0), 0);
    return {
      day: g[0].day,
      end: g[g.length - 1].day,
      invested,
      net_revenue,
      profit: net_revenue - invested,
      roas: invested > 0 ? net_revenue / invested : null,
    };
  });
  return { pts, gran };
}

function axisLabel(b: Bucket, gran: Gran): string {
  if (gran === "month") {
    const m = Number(b.day.slice(5, 7)) - 1;
    return MONTHS[m] ?? b.day.slice(5);
  }
  return b.day.slice(5); // MM-DD
}

function tooltipTitle(b: Bucket, gran: Gran): string {
  if (gran === "day") return b.day;
  if (gran === "month") {
    const m = Number(b.day.slice(5, 7)) - 1;
    return `${MONTHS[m] ?? ""} ${b.day.slice(0, 4)}`.trim();
  }
  return `${b.day.slice(5)} → ${b.end.slice(5)}`; // semana: intervalo
}

export default function TimeseriesChart({ data }: { data: Point[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const { pts, gran } = useMemo(() => bucketize(data), [data]);

  if (!data.length) return <p className="text-sm text-zinc-500">Sem dados no período.</p>;

  const n = pts.length;
  const moneyVals = pts.flatMap((d) => [Number(d.invested), Number(d.net_revenue), Number(d.profit)]);
  const yMax = Math.max(1, ...moneyVals);
  const yMin = Math.min(0, ...moneyVals);
  const rMax = Math.max(1, ...pts.map((d) => Number(d.roas) || 0));

  const plotW = W - PADL - PADR;
  const plotH = H - PADT - PADB;
  const x = (i: number) => PADL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PADT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const yR = (v: number) => PADT + plotH - (v / rMax) * plotH;
  const scaleOf = (key: keyof Bucket) => (key === "roas" ? yR : y);

  const path = (key: keyof Bucket, scale: (v: number) => number) =>
    pts
      .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${scale(Number(d[key]) || 0).toFixed(1)}`)
      .join(" ");

  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / ticks);
  const step = Math.max(1, Math.ceil(n / 8));

  function onMove(e: React.MouseEvent) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const frac = (fx * W - PADL) / plotW;
    const idx = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
    setHover(idx);
  }

  const hp = hover != null ? pts[hover] : null;
  const hxPct = hover != null ? (x(hover) / W) * 100 : 0;
  const granLabel = gran === "day" ? "por dia" : gran === "week" ? "por semana" : "por mês";

  return (
    <div className="w-full overflow-x-auto">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-aco">agrupado {granLabel}</span>
      </div>

      <div ref={wrapRef} className="relative" style={{ minWidth: 600 }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-zinc-500">
          {grid.map((g, i) => (
            <g key={i}>
              <line x1={PADL} x2={W - PADR} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity="0.1" />
              <text x={PADL - 6} y={y(g) + 3} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.6">
                {brlShort(g)}
              </text>
            </g>
          ))}
          {[0, rMax / 2, rMax].map((r, i) => (
            <text key={i} x={W - PADR + 6} y={yR(r) + 3} textAnchor="start" fontSize="10" fill="#f59e0b">
              {r.toFixed(1)}×
            </text>
          ))}
          {yMin < 0 && (
            <line x1={PADL} x2={W - PADR} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.3" strokeDasharray="3 3" />
          )}
          {SERIES.map((s) => (
            <path
              key={s.key}
              d={path(s.key, scaleOf(s.key))}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PADT} y2={PADT + plotH} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
              {SERIES.map((s) => {
                const v = Number(pts[hover][s.key]) || 0;
                return <circle key={s.key} cx={x(hover)} cy={scaleOf(s.key)(v)} r="3.5" fill={s.color} stroke="#0e0e14" strokeWidth="1.5" />;
              })}
            </g>
          )}
          {pts.map((d, i) =>
            i % step === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={H - PADB + 16} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">
                {axisLabel(d, gran)}
              </text>
            ) : null,
          )}
        </svg>

        {hp && (
          <div
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-white/[.15] bg-[var(--noite-2)] px-3 py-2 text-xs shadow-xl"
            style={{ left: `min(max(${hxPct}%, 70px), calc(100% - 70px))` }}
          >
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-aco">{tooltipTitle(hp, gran)}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-zinc-300">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-display text-foreground">
                  {s.money ? brl(Number(hp[s.key]) || 0) : hp.roas == null ? "—" : mult(hp.roas)}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
