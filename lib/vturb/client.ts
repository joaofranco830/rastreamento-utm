import "server-only";
import { getProjectCredential } from "@/lib/credentials";

/**
 * Cliente da API de Analytics do VTurb (server-only).
 * Base: https://analytics.vturb.net. Autenticação por dois headers obrigatórios:
 *   X-Api-Token: <token do cofre>   ·   X-Api-Version: v1
 * A API é AGREGADA (agrupa por player_id + período, e por campo/UTM) — não há
 * endpoint de conversão individual; por isso ela complementa (analytics do VSL),
 * não substitui, o nosso rastreio por pedido. Token lido do cofre por projeto.
 */

const BASE = "https://analytics.vturb.net";
const TZ = "America/Sao_Paulo";

export class VturbError extends Error {
  status?: number;
  code?: number;
  constructor(message: string, status?: number, code?: number) {
    super(message);
    this.name = "VturbError";
    this.status = status;
    this.code = code;
  }
}

async function vturbFetch(
  token: string,
  path: string,
  opts: { method: "GET" | "POST"; body?: unknown; query?: Record<string, string> } = { method: "GET" },
): Promise<unknown> {
  const url = new URL(BASE + path);
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) if (v != null) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    method: opts.method,
    headers: {
      "X-Api-Token": token,
      "X-Api-Version": "v1",
      "Content-Type": "application/json",
    },
    body: opts.method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* resposta não-JSON */
  }
  if (!res.ok) {
    const j = json as { error?: string; message?: string; code?: number } | null;
    throw new VturbError(j?.error || j?.message || `VTurb HTTP ${res.status}`, res.status, j?.code);
  }
  return json;
}

/** Token do VTurb do projeto (cofre cifrado). null se não configurado. */
export async function getVturbToken(projectId: number): Promise<string | null> {
  return getProjectCredential(projectId, "vturb", "api_key");
}

// ---- Tipos ----
export interface VturbPlayer {
  id: string;
  name: string;
  pitch_time: number;
  duration: number;
  created_at: string;
}

/** Linha de /traffic_origin/stats_by_day — performance do VSL por UTM e por dia. */
export interface VturbTrafficRow {
  date_key: string;
  query_key: string;
  grouped_field: string;
  total_viewed: number;
  total_started: number;
  total_finished: number;
  total_clicked: number;
  engagement_rate: number;
  total_over_pitch: number;
  total_under_pitch: number;
  over_pitch_rate: number;
  total_conversions: number;
  overall_conversion_rate: number;
  total_amount_usd: number;
  total_amount_brl: number;
  total_amount_eur: number;
  play_rate: number;
}

// ---- Endpoints ----

/** Lista todos os players (vídeos/VSLs) da conta. */
export async function listPlayers(token: string): Promise<VturbPlayer[]> {
  const data = await vturbFetch(token, "/players/list", { method: "GET" });
  return Array.isArray(data) ? (data as VturbPlayer[]) : [];
}

/** Estatísticas do player agrupadas por UTM (query_key) e por dia. */
export async function trafficOriginStatsByDay(
  token: string,
  p: { player_id: string; start_date: string; end_date: string; video_duration: number; query_keys?: string[]; timezone?: string },
): Promise<VturbTrafficRow[]> {
  const data = await vturbFetch(token, "/traffic_origin/stats_by_day", {
    method: "POST",
    body: {
      timezone: TZ,
      query_keys: ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"],
      ...p,
    },
  });
  return Array.isArray(data) ? (data as VturbTrafficRow[]) : [];
}
