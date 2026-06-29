"use client";

import { useState } from "react";

/** Campo somente-leitura com botão "copiar" (snippets de pixel / URL de webhook). */
export default function CopyField({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponível: usuário copia manualmente */
    }
  }

  return (
    <div className="flex items-stretch gap-2">
      <code
        className={`min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-black/[.1] bg-black/[.02] px-3 py-2 text-xs dark:border-white/[.14] dark:bg-white/[.03] ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
      >
        {copied ? "Copiado ✓" : "Copiar"}
      </button>
    </div>
  );
}
