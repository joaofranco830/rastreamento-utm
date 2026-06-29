/**
 * Parser de CSV minúsculo e robusto (aspas, vírgula/; como delimitador, BOM).
 * Puro (pode rodar no client). Usado pelo importador de vendas (INT-07).
 */

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^﻿/, ""); // remove BOM
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  // Hotmart BR costuma usar ';' — escolhe o delimitador mais frequente no cabeçalho.
  const delim = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      records.push(row);
      row = [];
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  const headers = (records.shift() ?? []).map((h) => h.trim());
  const rows = records
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => {
      const o: Record<string, string> = {};
      headers.forEach((h, idx) => {
        o[h] = (r[idx] ?? "").trim();
      });
      return o;
    });

  return { headers, rows };
}
