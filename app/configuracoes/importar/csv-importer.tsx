"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseCsv } from "@/lib/csv";
import { importCsvAction, type ImportMapping } from "./actions";

const TARGETS: { key: keyof ImportMapping; label: string; required?: boolean }[] = [
  { key: "transaction", label: "Transação (código)", required: true },
  { key: "gross_value", label: "Valor bruto", required: true },
  { key: "refunded_value", label: "Valor estornado" },
  { key: "status", label: "Status" },
  { key: "order_date", label: "Data da venda" },
  { key: "product_id", label: "ID do produto" },
  { key: "buyer_email", label: "E-mail do comprador" },
  { key: "buyer_name", label: "Nome do comprador" },
];

// Sugestão automática de coluna por nome do cabeçalho.
function guess(headers: string[], hints: string[]): string {
  const low = headers.map((h) => h.toLowerCase());
  for (const hint of hints) {
    const i = low.findIndex((h) => h.includes(hint));
    if (i >= 0) return headers[i];
  }
  return "";
}

export default function CsvImporter() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({ transaction: "", gross_value: "" });
  const [result, setResult] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setResult(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping({
      transaction: guess(parsed.headers, ["transa", "transaction", "código", "codigo"]),
      gross_value: guess(parsed.headers, ["bruto", "gross", "valor", "preço", "preco", "total"]),
      refunded_value: guess(parsed.headers, ["estorn", "reembol", "refund"]),
      status: guess(parsed.headers, ["status", "situa"]),
      order_date: guess(parsed.headers, ["data", "date"]),
      product_id: guess(parsed.headers, ["produto", "product"]),
      buyer_email: guess(parsed.headers, ["email", "e-mail"]),
      buyer_name: guess(parsed.headers, ["nome", "name", "comprador"]),
    });
  }

  function setMap(key: keyof ImportMapping, value: string) {
    setMapping((m) => ({ ...m, [key]: value }));
  }

  function run() {
    setResult(null);
    startTransition(async () => {
      const r = await importCsvAction(rows, mapping, filename);
      if (r.ok) {
        setResult(`Importadas ${r.inserted} novas · ${r.skipped} já existiam (deduplicadas) · ${r.total} no arquivo.`);
        router.refresh();
      } else {
        setResult(r.error ?? "Falha na importação.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <label className="mb-2 block text-sm font-medium">Arquivo CSV de vendas (Hotmart)</label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="block w-full text-sm text-zinc-500 file:mr-3 file:rounded-lg file:border-0 file:bg-foreground file:px-3 file:py-2 file:text-sm file:font-medium file:text-background"
        />
      </div>

      {headers.length > 0 && (
        <>
          <p className="text-sm text-zinc-500">
            {rows.length} linhas em <span className="font-mono">{filename}</span>. Confira o mapeamento das colunas:
          </p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TARGETS.map((t) => (
              <label key={t.key} className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">
                  {t.label} {t.required && <span className="text-red-500">*</span>}
                </span>
                <select
                  value={mapping[t.key] ?? ""}
                  onChange={(e) => setMap(t.key, e.target.value)}
                  className="rounded-lg border border-black/[.12] bg-transparent px-2.5 py-2 text-sm dark:border-white/[.18]"
                >
                  <option value="">— não importar —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <button
            onClick={run}
            disabled={pending || !mapping.transaction || !mapping.gross_value}
            className="self-start rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? "Importando…" : "Importar"}
          </button>
          <p className="text-xs text-zinc-400">
            Vendas já recebidas (mesma transação) são <strong>ignoradas</strong> (dedup). Linhas sem rastreio entram como
            <strong> não rastreadas</strong> — o faturamento (líquido) entra normalmente.
          </p>
        </>
      )}

      {result && <div className="rounded-lg border border-black/[.1] bg-black/[.02] p-3 text-sm dark:border-white/[.14] dark:bg-white/[.03]">{result}</div>}
    </div>
  );
}
