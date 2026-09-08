"use client";

import { useState } from "react";
import { getAdPreview } from "./actions";

/** Botão "ver criativo" + modal com a prévia (iframe do Meta). */
export default function AdPreview({ adMetaId, name }: { adMetaId: string | null; name?: string | null }) {
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function openPreview() {
    setOpen(true);
    setErr(null);
    setHtml(null);
    if (!adMetaId) {
      setErr("Anúncio sem ID no Meta.");
      return;
    }
    setLoading(true);
    const r = await getAdPreview(adMetaId);
    setLoading(false);
    if (r.ok && r.html) setHtml(r.html);
    else setErr(r.error ?? "Prévia indisponível.");
  }

  return (
    <>
      <button
        onClick={openPreview}
        title="Ver criativo"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/[.16] text-zinc-300 hover:border-eletrico hover:bg-eletrico/10"
      >
        👁
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
          <div className="flex max-h-[90vh] w-full max-w-[400px] flex-col rounded-2xl border border-white/[.12] bg-[var(--noite-2)] p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-base text-foreground">CRIATIVO</h3>
                {name && <p className="truncate text-xs text-aco" title={name}>{name}</p>}
              </div>
              <button onClick={() => setOpen(false)} className="shrink-0 rounded-lg border border-white/[.14] px-2 py-1 text-sm text-zinc-400 hover:bg-white/[.06]">✕</button>
            </div>

            <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-auto rounded-lg bg-white/[.02] [&_iframe]:mx-auto [&_iframe]:block [&_iframe]:max-w-full">
              {loading ? (
                <span className="flex items-center gap-2 text-sm text-aco">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20" style={{ borderTopColor: "var(--eletrico)" }} />
                  Carregando prévia…
                </span>
              ) : err ? (
                <span className="px-4 text-center text-sm text-zinc-400">{err}</span>
              ) : html ? (
                <div dangerouslySetInnerHTML={{ __html: html }} />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
