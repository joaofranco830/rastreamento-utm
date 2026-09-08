"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { VslData, VslMetrics, VslVideo, VslBreakdownRow, VslPlayerOption } from "@/lib/vturb/read";
import { syncVturbAction, refreshVturbPlayersAction, setVturbIncludedAction } from "@/app/configuracoes/integracoes-actions";
import { brl, inteiro } from "@/lib/format";

const PLANS: { key: string; label: string }[] = [
  { key: "basic", label: "Basic (60/min)" },
  { key: "pro", label: "Pro (120/min)" },
  { key: "scale", label: "Scale (300/min)" },
  { key: "enterprise", label: "Enterprise (800/min)" },
];

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
  const [plan, setPlan] = useState("basic");
  const [manage, setManage] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("vturb_plan");
      if (saved) setPlan(saved);
    } catch { /* ignore */ }
  }, []);
  function pickPlan(p: string) {
    setPlan(p);
    try { localStorage.setItem("vturb_plan", p); } catch { /* ignore */ }
  }

  function sync() {
    setMsg(null);
    start(async () => {
      const r = await syncVturbAction(plan);
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
        <select
          value={plan}
          onChange={(e) => pickPlan(e.target.value)}
          title="Seu plano do VTurb (define o limite de requisições/min)"
          className="rounded-lg border border-white/[.16] bg-[var(--noite-2)] px-2 py-2 text-sm text-zinc-200"
        >
          {PLANS.map((p) => <option key={p.key} value={p.key}>Plano {p.label}</option>)}
        </select>
        <button
          onClick={sync}
          disabled={pending}
          className="rounded-lg bg-[#ff5a5a] px-4 py-2 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Sincronizando…" : "⟳ Sincronizar VTurb"}
        </button>
        <button
          onClick={() => setManage((v) => !v)}
          className="rounded-lg border border-white/[.18] px-3 py-2 text-sm text-zinc-200 hover:bg-white/[.06]"
        >
          ⚙ Gerenciar VSLs ({data.players.filter((p) => p.included).length}/{data.players.length})
        </button>
        {data.lastSync && (
          <span className="text-xs text-zinc-400">Último sync: {new Date(data.lastSync).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
        )}
        {msg && <span className="w-full text-xs text-zinc-300">{msg}</span>}
      </div>

      {manage && <ManagePanel players={data.players} />}

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

function ManagePanel({ players }: { players: VslPlayerOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(players.filter((p) => p.included).map((p) => p.player_id)));

  const shown = players.filter((p) => !q.trim() || (p.name ?? p.player_id).toLowerCase().includes(q.trim().toLowerCase()));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function refreshList() {
    setMsg(null);
    start(async () => {
      const r = await refreshVturbPlayersAction();
      setMsg(r.ok ? `Lista atualizada — ${r.count ?? 0} VSL(s).` : r.error ?? "Falha.");
      if (r.ok) router.refresh();
    });
  }
  function save() {
    setMsg(null);
    start(async () => {
      const r = await setVturbIncludedAction([...selected]);
      setMsg(r.ok ? "Seleção salva ✓ — agora clique em Sincronizar VTurb." : r.error ?? "Falha.");
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="mb-4 rounded-xl border border-white/[.12] bg-[var(--noite-2)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-lima">Gerenciar VSLs</p>
        <button onClick={refreshList} disabled={pending} className="rounded-lg border border-white/[.18] px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/[.06] disabled:opacity-50">
          {pending ? "…" : "Atualizar lista"}
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar VSL…"
          className="min-w-[160px] flex-1 rounded-lg border border-white/[.16] bg-transparent px-3 py-1.5 text-sm text-foreground placeholder:text-zinc-500"
        />
        <button onClick={save} disabled={pending} className="rounded-lg bg-lima px-4 py-1.5 text-sm font-bold text-[var(--noite)] hover:opacity-90 disabled:opacity-50">
          Salvar seleção ({selected.size})
        </button>
        {msg && <span className="w-full text-xs text-zinc-300">{msg}</span>}
      </div>
      {players.length === 0 ? (
        <p className="text-sm text-zinc-400">Nenhuma VSL listada. Clique em <strong>“Atualizar lista”</strong> para buscar da conta.</p>
      ) : (
        <ul className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
          {shown.map((p) => (
            <li key={p.player_id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/[.05]">
                <input type="checkbox" checked={selected.has(p.player_id)} onChange={() => toggle(p.player_id)} className="accent-eletrico" />
                <span className="truncate text-foreground" title={p.name ?? p.player_id}>{p.name ?? p.player_id}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-zinc-400">Selecione só as VSLs relevantes — puxar poucas evita estourar o limite de requisições da API.</p>
    </div>
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
