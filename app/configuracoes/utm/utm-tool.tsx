"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { defaultLinks, buildUrl, UTM_KEYS, type UtmLink } from "@/lib/utm";
import CopyField from "../copy-field";
import { saveLinkSetAction, deleteLinkSetAction, verifyPixelAction } from "./actions";

interface SavedSet {
  id: number;
  name: string;
  base_url: string;
  links: UtmLink[];
  updated_at: string;
}

export default function UtmTool({
  savedSets,
  pixelKey,
}: {
  savedSets: SavedSet[];
  pixelKey: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [baseUrl, setBaseUrl] = useState("");
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  const [links, setLinks] = useState<UtmLink[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  // Verificador
  const [verifyUrl, setVerifyUrl] = useState("");
  const [verifyResult, setVerifyResult] = useState<{ found: boolean; detail: string } | null>(null);

  function generate() {
    if (!baseUrl.trim()) return;
    setLinks(defaultLinks(baseUrl.trim()));
  }

  function updateParam(idx: number, key: string, value: string) {
    setLinks((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const params = { ...l.params, [key]: value };
        return { ...l, params, full_url: buildUrl(baseUrl, params) };
      }),
    );
  }

  function updateLabel(idx: number, value: string) {
    setLinks((prev) => prev.map((l, i) => (i === idx ? { ...l, label: value } : l)));
  }

  function addCustom() {
    setLinks((prev) => [
      ...prev,
      { label: "Novo link", kind: "organic", params: { utm_source: "", utm_medium: "", utm_campaign: "" }, full_url: baseUrl },
    ]);
  }

  function removeLink(idx: number) {
    setLinks((prev) => prev.filter((_, i) => i !== idx));
  }

  function loadSet(s: SavedSet) {
    setEditingId(s.id);
    setName(s.name);
    setBaseUrl(s.base_url);
    setLinks(s.links ?? []);
    setMsg(null);
  }

  function reset() {
    setEditingId(undefined);
    setName("");
    setBaseUrl("");
    setLinks([]);
    setMsg(null);
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await saveLinkSetAction({ id: editingId, name, baseUrl, links });
      if (r.ok) {
        setMsg("Salvo ✓");
        router.refresh();
      } else {
        setMsg(r.error ?? "Falha ao salvar.");
      }
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      await deleteLinkSetAction(id);
      if (editingId === id) reset();
      router.refresh();
    });
  }

  function verify() {
    if (!verifyUrl.trim()) return;
    setVerifyResult(null);
    startTransition(async () => {
      const r = await verifyPixelAction(verifyUrl.trim(), pixelKey);
      setVerifyResult(r);
    });
  }

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Construtor de UTMs</h1>
        <p className="text-sm text-zinc-400">Gere links rastreados (pago/orgânico), edite e salve tabelas reabríveis.</p>
      </div>

      {/* Builder */}
      <section className="flex flex-col gap-3">
        <label className="text-sm font-medium">URL de vendas (base)</label>
        <div className="flex gap-2">
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://pay.hotmart.com/..."
            className="min-w-0 flex-1 rounded-lg border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
          />
          <button onClick={generate} disabled={pending} className="shrink-0 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50">
            Gerar padrões
          </button>
        </div>

        {links.length > 0 && (
          <div className="flex flex-col gap-4">
            {links.map((l, idx) => (
              <div key={idx} className="rounded-xl border border-black/[.08] p-3 dark:border-white/[.12]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <input
                    value={l.label}
                    onChange={(e) => updateLabel(idx, e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                  />
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${l.kind === "paid" ? "bg-blue-400/15 text-blue-600 dark:text-blue-300" : "bg-zinc-400/15 text-zinc-600 dark:text-zinc-300"}`}>
                    {l.kind === "paid" ? "pago" : "orgânico"}
                  </span>
                  <button onClick={() => removeLink(idx)} className="text-xs text-zinc-400 hover:text-red-500">remover</button>
                </div>
                <div className="mb-2 grid grid-cols-1 gap-1.5 sm:grid-cols-5">
                  {UTM_KEYS.map((k) => (
                    <input
                      key={k}
                      value={l.params[k] ?? ""}
                      onChange={(e) => updateParam(idx, k, e.target.value)}
                      placeholder={k.replace("utm_", "")}
                      className="rounded-md border border-black/[.1] bg-transparent px-2 py-1 text-xs dark:border-white/[.14]"
                    />
                  ))}
                </div>
                <CopyField value={l.full_url} />
              </div>
            ))}
            <button onClick={addCustom} className="self-start text-sm text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200">+ adicionar variação</button>
          </div>
        )}

        {links.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da tabela (ex.: Lançamento Maio)"
              className="min-w-0 flex-1 rounded-lg border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
            />
            <button onClick={save} disabled={pending} className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50">
              {editingId ? "Atualizar" : "Salvar tabela"}
            </button>
            {editingId && (
              <button onClick={reset} className="rounded-lg border border-black/[.12] px-3 py-2 text-sm dark:border-white/[.18]">Novo</button>
            )}
            {msg && <span className="text-sm text-zinc-400">{msg}</span>}
          </div>
        )}
      </section>

      {/* Tabelas salvas */}
      {savedSets.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-zinc-400">Tabelas salvas</h2>
          <div className="flex flex-col divide-y divide-black/[.06] rounded-xl border border-black/[.08] dark:divide-white/[.08] dark:border-white/[.12]">
            {savedSets.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <button onClick={() => loadSet(s)} className="min-w-0 flex-1 truncate text-left hover:underline">
                  {s.name} <span className="text-xs text-zinc-400">· {s.links?.length ?? 0} links</span>
                </button>
                <button onClick={() => remove(s.id)} disabled={pending} className="text-xs text-zinc-400 hover:text-red-500">excluir</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Verificador de pixel */}
      <section className="flex flex-col gap-3 border-t border-black/[.06] pt-8 dark:border-white/[.08]">
        <h2 className="text-lg font-medium">Verificador de pixel</h2>
        <p className="text-sm text-zinc-400">Informe a URL de uma página do funil — checamos se o pixel está no HTML servido.</p>
        <div className="flex gap-2">
          <input
            value={verifyUrl}
            onChange={(e) => setVerifyUrl(e.target.value)}
            placeholder="https://seu-funil.com/pagina"
            className="min-w-0 flex-1 rounded-lg border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]"
          />
          <button onClick={verify} disabled={pending} className="shrink-0 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50">
            {pending ? "Verificando…" : "Verificar"}
          </button>
        </div>
        {verifyResult && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              verifyResult.found
                ? "border-emerald-300/40 bg-emerald-50/40 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200"
                : "border-amber-300/40 bg-amber-50/40 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
            }`}
          >
            {verifyResult.detail}
          </div>
        )}
      </section>
    </div>
  );
}
