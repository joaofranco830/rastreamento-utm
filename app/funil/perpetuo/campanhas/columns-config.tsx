"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCampaignColumnsAction } from "../funnel-actions";
import { COLUMN_CATALOG, COLUMN_LABEL, DEFAULT_COLUMNS } from "./columns";

interface Preset {
  name: string;
  cols: string[];
}
interface Item {
  key: string;
  enabled: boolean;
}

function buildItems(cols: string[] | null): Item[] {
  const catalog = COLUMN_CATALOG.map((c) => c.key);
  const active = (cols ?? DEFAULT_COLUMNS).filter((k) => catalog.includes(k));
  const rest = catalog.filter((k) => !active.includes(k));
  return [...active.map((k) => ({ key: k, enabled: true })), ...rest.map((k) => ({ key: k, enabled: false }))];
}

/** Botão + modal "Personalizar colunas" da Tela Campanhas. */
export default function ColumnsConfig({ current, presets: initialPresets }: { current: string[] | null; presets: Preset[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>(() => buildItems(current));
  const [presets, setPresets] = useState<Preset[]>(initialPresets);
  const [presetName, setPresetName] = useState("Personalizado");
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const enabledCount = items.filter((i) => i.enabled).length;
  const activeCols = () => items.filter((i) => i.enabled).map((i) => i.key);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => !needle || COLUMN_LABEL[it.key].toLowerCase().includes(needle));
  }, [items, q]);

  function toggle(key: string) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, enabled: !i.enabled } : i)));
  }
  function reorder(from: number, to: number) {
    if (from === to) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }
  function loadPreset(name: string) {
    setPresetName(name);
    if (name === "Personalizado") return;
    const p = presets.find((x) => x.name === name);
    if (p) setItems(buildItems(p.cols));
  }
  function savePreset() {
    const name = window.prompt("Nome da pré-definição:", presetName === "Personalizado" ? "" : presetName)?.trim();
    if (!name) return;
    const cols = activeCols();
    setPresets((prev) => [...prev.filter((p) => p.name !== name), { name, cols }]);
    setPresetName(name);
    setMsg(`Pré-definição "${name}" salva (clique em Aplicar para gravar).`);
  }
  function deletePreset() {
    if (presetName === "Personalizado") return;
    setPresets((prev) => prev.filter((p) => p.name !== presetName));
    setPresetName("Personalizado");
  }
  function apply() {
    setMsg(null);
    start(async () => {
      const r = await saveCampaignColumnsAction({ cols: activeCols(), presets });
      if (!r.ok) {
        setMsg(r.error ?? "Falha ao salvar.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => {
          setItems(buildItems(current));
          setPresets(initialPresets);
          setMsg(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-white/[.18] px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[.06]"
      >
        <span aria-hidden>▦</span> Colunas
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/[.12] bg-[var(--noite-2)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg text-foreground">PERSONALIZAR COLUNAS</h3>
                <p className="text-xs text-aco">Escolha, reordene (arraste) e salve pré-definições.</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg border border-white/[.14] px-2 py-1 text-sm text-zinc-400 hover:bg-white/[.06]">✕</button>
            </div>

            <div className="mb-3 flex items-center gap-2">
              <select value={presetName} onChange={(e) => loadPreset(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/[.14] bg-transparent px-3 py-2 text-sm text-foreground">
                <option value="Personalizado">Personalizado</option>
                {presets.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
              <button onClick={deletePreset} disabled={presetName === "Personalizado"} className="rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-40">🗑</button>
            </div>

            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar colunas…" className="mb-3 w-full rounded-lg border border-white/[.14] bg-transparent px-3 py-2 text-sm" />

            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-aco">Colunas</span>
              <span className="rounded-full bg-eletrico/15 px-2 py-0.5 text-[11px] font-medium text-eletrico-cl">{enabledCount}/{COLUMN_CATALOG.length}</span>
            </div>

            <div className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
              {shown.map(({ it, idx }) => (
                <div
                  key={it.key}
                  draggable
                  onDragStart={() => setDrag(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (drag !== null) reorder(drag, idx);
                    setDrag(null);
                  }}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${drag === idx ? "border-eletrico" : "border-white/[.1]"} bg-white/[.02]`}
                >
                  <span className="cursor-grab select-none text-aco" aria-hidden>⠿</span>
                  <button onClick={() => toggle(it.key)} role="switch" aria-checked={it.enabled} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${it.enabled ? "bg-eletrico" : "bg-white/[.14]"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${it.enabled ? "left-4" : "left-0.5"}`} />
                  </button>
                  <span className="flex-1 text-sm">{COLUMN_LABEL[it.key]}</span>
                </div>
              ))}
            </div>

            {msg && <p className="mt-3 text-xs text-zinc-400">{msg}</p>}

            <div className="mt-4 flex items-center justify-between gap-2">
              <button onClick={savePreset} className="rounded-lg border border-white/[.18] px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-white/[.06]">Salvar pré-definição</button>
              <button onClick={apply} disabled={pending} className="rounded-lg bg-lima px-4 py-2 text-sm font-bold text-[var(--noite)] disabled:opacity-50">{pending ? "Aplicando…" : "Aplicar"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
