"use client";

import { Fragment, useState, useTransition } from "react";
import { loadChildren } from "./actions";
import { COLS } from "./columns";
import type { CampaignRow, Level } from "@/lib/campanhas";

function statusBadge(s: string | null) {
  const base = "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium";
  if (s === "ACTIVE") return <span className={`${base} bg-emerald-500/15 text-emerald-600 dark:text-emerald-400`}>ATIVO</span>;
  if (s === "PAUSED") return <span className={`${base} bg-zinc-500/15 text-zinc-500`}>PAUSADO</span>;
  if (!s) return <span className="text-zinc-400">—</span>;
  return <span className={`${base} bg-amber-500/15 text-amber-600 dark:text-amber-400`}>{s}</span>;
}

type Item =
  | { kind: "row"; row: CampaignRow; depth: number; level: Level }
  | { kind: "loading"; depth: number; key: string };

export default function CampaignsTree({
  campaigns,
  from,
  to,
}: {
  campaigns: CampaignRow[];
  from: string;
  to: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cache, setCache] = useState<Record<string, CampaignRow[]>>({});
  const [, startTransition] = useTransition();

  const keyFor = (level: "campaign" | "adset", metaId: string) =>
    (level === "campaign" ? "c:" : "a:") + metaId;

  function toggle(level: "campaign" | "adset", metaId: string) {
    const key = keyFor(level, metaId);
    const wasExpanded = expanded.has(key);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!wasExpanded && !cache[key]) {
      const childLevel: Level = level === "campaign" ? "adset" : "creative";
      startTransition(async () => {
        const rows = await loadChildren(childLevel, metaId, from, to);
        setCache((prev) => ({ ...prev, [key]: rows }));
      });
    }
  }

  // monta a lista visível em ordem de árvore (campanhas → conjuntos → anúncios)
  const items: Item[] = [];
  for (const c of campaigns) {
    items.push({ kind: "row", row: c, depth: 0, level: "campaign" });
    const ck = keyFor("campaign", c.meta_id);
    if (expanded.has(ck)) {
      const adsets = cache[ck];
      if (!adsets) {
        items.push({ kind: "loading", depth: 1, key: ck });
      } else {
        for (const a of adsets) {
          items.push({ kind: "row", row: a, depth: 1, level: "adset" });
          const ak = keyFor("adset", a.meta_id);
          if (expanded.has(ak)) {
            const ads = cache[ak];
            if (!ads) items.push({ kind: "loading", depth: 2, key: ak });
            else for (const ad of ads) items.push({ kind: "row", row: ad, depth: 2, level: "creative" });
          }
        }
      }
    }
  }

  const span = COLS.length + 2;

  return (
    <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.12]">
      <table className="w-full min-w-max text-xs">
        <thead className="bg-black/[.02] text-left text-zinc-500 dark:bg-white/[.03]">
          <tr className="border-b border-black/[.06] dark:border-white/[.08]">
            <th className="sticky left-0 z-10 bg-black/[.02] px-3 py-2 font-medium dark:bg-zinc-950">Nome</th>
            <th className="px-3 py-2 font-medium">Veic.</th>
            {COLS.map((c) => (
              <th key={c.h} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                {c.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campaigns.length === 0 ? (
            <tr>
              <td colSpan={span} className="px-3 py-4 text-zinc-500">
                Sem dados no período/escopo.
              </td>
            </tr>
          ) : (
            items.map((it) => {
              if (it.kind === "loading") {
                return (
                  <tr key={`loading:${it.key}`}>
                    <td colSpan={span} className="px-3 py-1.5 text-zinc-400" style={{ paddingLeft: 14 + it.depth * 18 }}>
                      carregando…
                    </td>
                  </tr>
                );
              }
              const { row, depth, level } = it;
              const canExpand = level === "campaign" || level === "adset";
              const ekey = canExpand ? keyFor(level as "campaign" | "adset", row.meta_id) : "";
              const isOpen = canExpand && expanded.has(ekey);
              return (
                <Fragment key={`${level}:${row.meta_id}`}>
                  <tr className="border-b border-black/[.04] hover:bg-black/[.02] dark:border-white/[.06] dark:hover:bg-white/[.03]">
                    <td className="sticky left-0 z-10 max-w-[320px] bg-background px-3 py-2">
                      <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 18 }}>
                        {canExpand ? (
                          <button
                            onClick={() => toggle(level as "campaign" | "adset", row.meta_id)}
                            className="flex w-4 shrink-0 justify-center text-zinc-400 hover:text-foreground"
                            aria-label={isOpen ? "Recolher" : "Expandir"}
                          >
                            {isOpen ? "▾" : "▸"}
                          </button>
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}
                        <span className="truncate" title={row.name ?? ""}>
                          {row.name ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">{statusBadge(row.effective_status)}</td>
                    {COLS.map((c) => (
                      <td key={c.h} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {c.f(row)}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
