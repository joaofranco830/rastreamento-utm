"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDashboardLayoutAction } from "./funnel-actions";
import MetricFormulaBuilder from "./metric-formula-builder";
import {
  METRIC_CATALOG,
  METRIC_LABEL,
  type FieldDef,
  type CustomMetric,
} from "@/lib/dashboard-metrics";

interface Preset {
  name: string;
  cards: string[];
}
interface Item {
  key: string;
  enabled: boolean;
}

/** Monta a lista ordenada: ativos (na ordem salva) primeiro, depois o resto desligado. */
function buildItems(cards: string[] | null, customIds: string[]): Item[] {
  const base = METRIC_CATALOG.map((m) => m.key);
  const catalog = [...base, ...customIds];
  const active = (cards ?? base).filter((k) => catalog.includes(k));
  const rest = catalog.filter((k) => !active.includes(k));
  return [
    ...active.map((k) => ({ key: k, enabled: true })),
    ...rest.map((k) => ({ key: k, enabled: cards ? false : true })),
  ];
}

/** Botão + modal de "Configurar métricas": selecionar, reordenar (arrastar), criar personalizadas e pré-definições. */
export default function MetricsConfig({
  current,
  presets: initialPresets,
  customMetrics: initialCustom,
  fields,
  values,
}: {
  current: string[] | null;
  presets: Preset[];
  customMetrics: CustomMetric[];
  fields: FieldDef[];
  values: Record<string, number | null>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>(initialCustom);
  const [items, setItems] = useState<Item[]>(() => buildItems(current, initialCustom.map((c) => c.id)));
  const [presets, setPresets] = useState<Preset[]>(initialPresets);
  const [presetName, setPresetName] = useState("Personalizado");
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [builder, setBuilder] = useState<{ initial: CustomMetric | null } | null>(null);

  const labelOf = (key: string) => METRIC_LABEL[key] ?? customMetrics.find((c) => c.id === key)?.name ?? key;
  const isCustom = (key: string) => key.startsWith("custom_");
  const enabledCount = items.filter((i) => i.enabled).length;
  const activeCards = () => items.filter((i) => i.enabled).map((i) => i.key);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => !needle || labelOf(it.key).toLowerCase().includes(needle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, customMetrics]);

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
    if (p) setItems(buildItems(p.cards, customMetrics.map((c) => c.id)));
  }

  function savePreset() {
    const name = window.prompt("Nome da pré-definição:", presetName === "Personalizado" ? "" : presetName)?.trim();
    if (!name) return;
    const cards = activeCards();
    setPresets((prev) => {
      const others = prev.filter((p) => p.name !== name);
      return [...others, { name, cards }];
    });
    setPresetName(name);
    setMsg(`Pré-definição "${name}" salva (clique em Aplicar para gravar).`);
  }

  function deletePreset() {
    if (presetName === "Personalizado") return;
    setPresets((prev) => prev.filter((p) => p.name !== presetName));
    setPresetName("Personalizado");
  }

  /** Salva (cria/edita) uma métrica personalizada vinda do construtor. */
  function saveCustom(m: CustomMetric) {
    setCustomMetrics((prev) => {
      const exists = prev.some((c) => c.id === m.id);
      return exists ? prev.map((c) => (c.id === m.id ? m : c)) : [...prev, m];
    });
    setItems((prev) => (prev.some((i) => i.key === m.id) ? prev : [...prev, { key: m.id, enabled: true }]));
    setBuilder(null);
  }

  function deleteCustom(id: string) {
    setCustomMetrics((prev) => prev.filter((c) => c.id !== id));
    setItems((prev) => prev.filter((i) => i.key !== id));
  }

  function apply() {
    setMsg(null);
    start(async () => {
      const r = await saveDashboardLayoutAction({ cards: activeCards(), presets, customMetrics });
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
          setCustomMetrics(initialCustom);
          setItems(buildItems(current, initialCustom.map((c) => c.id)));
          setPresets(initialPresets);
          setMsg(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-white/[.18] px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[.06]"
      >
        <span aria-hidden>⚙</span> Configurar métricas
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/[.12] bg-[var(--noite-2)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* header */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg text-foreground">CONFIGURAR MÉTRICAS</h3>
                <p className="text-xs text-aco">Escolha, reordene (arraste), crie personalizadas e salve pré-definições.</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg border border-white/[.14] px-2 py-1 text-sm text-zinc-400 hover:bg-white/[.06]">✕</button>
            </div>

            {/* presets */}
            <div className="mb-3 flex items-center gap-2">
              <select
                value={presetName}
                onChange={(e) => loadPreset(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-white/[.14] bg-transparent px-3 py-2 text-sm text-foreground"
              >
                <option value="Personalizado">Personalizado</option>
                {presets.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
              <button
                onClick={deletePreset}
                disabled={presetName === "Personalizado"}
                title="Excluir pré-definição"
                className="rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-40"
              >
                🗑
              </button>
            </div>

            {/* criar personalizada */}
            <button
              onClick={() => setBuilder({ initial: null })}
              className="mb-3 w-full rounded-lg border border-dashed border-eletrico/50 px-3 py-2 text-sm font-medium text-eletrico-cl hover:bg-eletrico/10"
            >
              ＋ Criar métrica personalizada
            </button>

            {/* search */}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar métricas…"
              className="mb-3 w-full rounded-lg border border-white/[.14] bg-transparent px-3 py-2 text-sm"
            />

            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-aco">Cards</span>
              <span className="rounded-full bg-eletrico/15 px-2 py-0.5 text-[11px] font-medium text-eletrico-cl">
                {enabledCount}/{items.length}
              </span>
            </div>

            {/* lista arrastável */}
            <div className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-1">
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
                  <span className="cursor-grab select-none text-aco" title="Arraste para reordenar" aria-hidden>⠿</span>
                  <button
                    onClick={() => toggle(it.key)}
                    role="switch"
                    aria-checked={it.enabled}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${it.enabled ? "bg-eletrico" : "bg-white/[.14]"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${it.enabled ? "left-4" : "left-0.5"}`} />
                  </button>
                  <span className="flex-1 text-sm">
                    {labelOf(it.key)}
                    {isCustom(it.key) && <span className="ml-2 rounded bg-lima/15 px-1.5 py-0.5 text-[10px] font-medium text-lima">fórmula</span>}
                  </span>
                  {isCustom(it.key) && (
                    <span className="flex gap-1">
                      <button
                        onClick={() => setBuilder({ initial: customMetrics.find((c) => c.id === it.key) ?? null })}
                        title="Editar fórmula"
                        className="rounded border border-white/[.14] px-1.5 py-0.5 text-xs text-zinc-300 hover:bg-white/[.06]"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => deleteCustom(it.key)}
                        title="Excluir métrica"
                        className="rounded border border-red-500/40 px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-500/10"
                      >
                        🗑
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>

            {msg && <p className="mt-3 text-xs text-zinc-400">{msg}</p>}

            {/* footer */}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button onClick={savePreset} className="rounded-lg border border-white/[.18] px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-white/[.06]">
                Salvar pré-definição
              </button>
              <button onClick={apply} disabled={pending} className="rounded-lg bg-lima px-4 py-2 text-sm font-bold text-[var(--noite)] disabled:opacity-50">
                {pending ? "Aplicando…" : "Aplicar configuração"}
              </button>
            </div>
          </div>
        </div>
      )}

      {builder && (
        <MetricFormulaBuilder
          fields={fields}
          values={values}
          initial={builder.initial}
          onSave={saveCustom}
          onClose={() => setBuilder(null)}
        />
      )}
    </>
  );
}
