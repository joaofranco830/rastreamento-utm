"use client";

import { useState, useTransition } from "react";
import { saveCampaignTags } from "./actions";

export default function CampaignTagsForm({ initialTags }: { initialTags: string[] }) {
  const [value, setValue] = useState(initialTags.join("\n"));
  const [saved, setSaved] = useState<string[]>(initialTags);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = value.trim() !== saved.join("\n");

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveCampaignTags(value);
      if (res.ok) {
        const tags = res.tags ?? [];
        setSaved(tags);
        setValue(tags.join("\n"));
        setMsg(tags.length ? "Salvo ✓" : "Salvo (sem tags — nenhuma campanha será filtrada)");
      } else {
        setMsg(res.error ?? "Erro ao salvar");
      }
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        placeholder="Ex.: [GEO-VOZ-02]"
        spellCheck={false}
        className="w-full rounded-xl border border-black/[.12] bg-transparent px-3 py-2.5 font-mono text-sm outline-none focus:border-foreground dark:border-white/[.2]"
      />
      <p className="text-xs text-zinc-400">
        Uma tag por linha. Só campanhas cujo <b>nome contém</b> alguma dessas tags entram nas contas
        e aparecem no dashboard. Deixe vazio para não filtrar por tag.
      </p>

      {saved.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {saved.map((t) => (
            <span
              key={t}
              className="rounded-md bg-black/[.05] px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-white/[.08] dark:text-zinc-300"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "Salvando…" : "Salvar tags"}
        </button>
        {msg && <span className="text-xs text-zinc-400">{msg}</span>}
      </div>
    </div>
  );
}
