"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { VslData, VslMetrics, VslVideo, VslBreakdownRow } from "@/lib/vturb/read";
import { syncVturbAction } from "@/app/configuracoes/integracoes-actions";
import { brl, inteiro } from "@/lib/format";

const pct1 = (v: number) => `${(Number(v) || 0).toFixed(1).replace(".", ",")}%`;
const secs = (v: number) => {
  const s = Math.round(Number(v) || 0);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
};

type Tab = "videos" | "campaign" | "content";
const TABS: { key: Tab; label: string }[] = [
  { key: "videos", label: "Por vídeo" },
  { key: "campaign", label: "Por campanha" },
  { key: "content", label: "Por criativo" },
];

export default function VslsView({ data, hasKey }: { data: VslData; hasKey: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("videos");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function sync() {
    setMsg(null);
    start(async () => {
      const r = await syncVturbAction();
      if (!r.ok) {
        setMsg(r.error ?? "Falha.");
      } else {
        const parts = [`${r.players ?? 0} vídeo(s)`, `${inteiro(r.rows ?? 0)} linhas`];
        if (r.withData != null) parts.push(`${r.withData} com dados`);
        if (r.errors) parts.push(`${r.errors} erro(s)`);
        let m = `Sincronizado ✓ — ${parts.join(", ")}.`;
        if ((r.rows ?? 0) === 0 && r.firstError) m += ` Motivo: ${r.firstError}`;
        setMsg(m);
      }
      if (r.ok) router.refresh();
    });
  }

  const isEmpty = data.videos.length === 0 && data.byCampaign.length === 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-white/[.14] text-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 transition-colors ${tab === t.key ? "bg-eletrico font-medium text-white" : "text-zinc-300 hover:bg-white/[.06]"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={sync}
          disabled={pending}
          className="rounded-lg bg-[#ff5a5a] px-4 py-2 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Sincronizando…" : "⟳ Sincronizar VTurb"}
        </button>
        {data.lastSync && (
          <span className="text-xs text-zinc-400">Último sync: {new Date(data.lastSync).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
        )}
        {msg && <span className="text-xs text-zinc-300">{msg}</span>}
      </div>

      {!hasKey && (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Nenhuma API key do VTurb salva neste projeto. Vá em <strong>Configurações → Integração VTurb</strong> para conectar.
        </p>
      )}
      {hasKey && isEmpty && (
        <p className="mb-3 rounded-lg border border-white/[.12] bg-white/[.03] px-3 py-2 text-sm text-zinc-300">
          Sem dados de VSL no período. Clique em <strong>“Sincronizar VTurb”</strong> para puxar (a primeira vez pode levar até ~1 min).
        </p>
      )}

      {tab === "videos" && data.videos.length > 0 && <VideosTable rows={data.videos} />}
      {tab === "campaign" && <BreakdownTable rows={data.byCampaign} label="Campanha" />}
      {tab === "content" && <BreakdownTable rows={data.byContent} label="Criativo" />}
    </>
  );
}

const HEADERS = ["Views", "Play rate", "Engajamento", "Retenção pitch", "Cliques", "Conversões", "Conv. rate", "Receita (VTurb)"];

function MetricCells({ m }: { m: VslMetrics }) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums text-foreground">{inteiro(m.viewed)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{pct1(m.play_rate)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{pct1(m.engagement_rate)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{pct1(m.over_pitch_rate)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{inteiro(m.clicked)}</td>
      <td className="px-3 py-2 text-right tabular-nums font-display text-foreground">{inteiro(m.conversions)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-lima">{pct1(m.conversion_rate)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-foreground">{brl(m.amount_brl)}</td>
    </>
  );
}

function VideosTable({ rows }: { rows: VslVideo[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[.1]">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-white/[.1] text-left font-mono text-[10px] uppercase tracking-wider text-aco">
            <th className="px-3 py-2 font-normal">Vídeo (VSL)</th>
            {HEADERS.map((h) => <th key={h} className="px-3 py-2 text-right font-normal">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.player_id} className="border-b border-white/[.06] last:border-0">
              <td className="px-3 py-2">
                <span className="block truncate text-foreground">{r.name}</span>
                <span className="block text-[11px] text-zinc-400">duração {secs(r.duration)} · pitch {secs(r.pitch_time)}</span>
              </td>
              <MetricCells m={r} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BreakdownTable({ rows, label }: { rows: VslBreakdownRow[]; label: string }) {
  if (rows.length === 0) return <p className="text-sm text-zinc-400">Sem dados por {label.toLowerCase()} no período.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[.1]">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-white/[.1] text-left font-mono text-[10px] uppercase tracking-wider text-aco">
            <th className="px-3 py-2 font-normal">{label}</th>
            {HEADERS.map((h) => <th key={h} className="px-3 py-2 text-right font-normal">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.value} className="border-b border-white/[.06] last:border-0">
              <td className="px-3 py-2"><span className="block max-w-[360px] truncate text-foreground" title={r.value}>{r.value}</span></td>
              <MetricCells m={r} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
