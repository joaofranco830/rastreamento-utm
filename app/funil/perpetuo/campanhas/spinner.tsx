"use client";

/** Overlay com círculo girando, exibido enquanto a tabela carrega. */
export default function Spinner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-start justify-center pt-24">
      <div className="flex items-center gap-3 rounded-full border border-white/[.12] bg-[var(--noite-2)]/90 px-4 py-2 shadow-xl backdrop-blur-sm">
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20"
          style={{ borderTopColor: "var(--eletrico)" }}
        />
        <span className="text-xs text-zinc-300">Carregando…</span>
      </div>
    </div>
  );
}
