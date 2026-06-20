"use client";

interface Point {
  day: string;
  invested: number;
  net_revenue: number;
  profit: number;
  roas: number | null;
}

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

export default function TimeseriesChart({ data }: { data: Point[] }) {
  if (!data.length) return <p className="text-sm text-zinc-500">Sem dados no período.</p>;

  const n = data.length;
  const moneyVals = data.flatMap((d) => [Number(d.invested), Number(d.net_revenue), Number(d.profit)]);
  const yMax = Math.max(1, ...moneyVals);
  const yMin = Math.min(0, ...moneyVals);
  const rMax = Math.max(1, ...data.map((d) => Number(d.roas) || 0));

  const plotW = W - PADL - PADR;
  const plotH = H - PADT - PADB;
  const x = (i: number) => PADL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PADT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const yR = (v: number) => PADT + plotH - (v / rMax) * plotH;

  const path = (key: keyof Point, scale: (v: number) => number) =>
    data
      .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${scale(Number(d[key]) || 0).toFixed(1)}`)
      .join(" ");

  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / ticks);
  const step = Math.max(1, Math.ceil(n / 6));

  const SERIES = [
    { key: "invested" as const, color: "#a1a1aa", label: "Gasto", scale: y },
    { key: "net_revenue" as const, color: "#22c55e", label: "Faturamento", scale: y },
    { key: "profit" as const, color: "#3b82f6", label: "Lucro", scale: y },
    { key: "roas" as const, color: "#f59e0b", label: "ROAS (×, eixo dir.)", scale: yR },
  ];

  return (
    <div className="w-full overflow-x-auto">
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-zinc-500">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-zinc-500" style={{ minWidth: 600 }}>
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
            d={path(s.key, s.scale)}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {data.map((d, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - PADB + 16} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">
              {d.day.slice(5)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
