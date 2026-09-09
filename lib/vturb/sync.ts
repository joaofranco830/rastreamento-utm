import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getVturbToken, listPlayers, sessionStatsByDay, trafficOriginStatsByDay, VturbError, type VturbTrafficRow } from "./client";

/**
 * Sync do Analytics do VSL (VTurb) POR PROJETO. Lista os players e, para cada um,
 * grava stats por dia: totais (dimension='total') via /sessions/stats_by_day e
 * o breakdown por UTM via /traffic_origin/stats_by_day. Upsert idempotente em
 * vturb_players / vturb_daily. Roda on-demand (botão) e pode ser agendado depois.
 */

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return isFinite(n) ? n : 0;
};
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export interface VturbSyncResult {
  ok: boolean;
  skipped?: string;
  players?: number;
  rows?: number;
  withData?: number;
  errors?: number;
  firstError?: string;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Executa uma chamada; em 429 (rate limit) espera e tenta 1x mais. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof VturbError && e.status === 429) {
      await sleep(4000);
      return await fn();
    }
    throw e;
  }
}

function rowToRecord(projectId: number, playerId: string, dimension: string, value: string, r: VturbTrafficRow) {
  return {
    project_id: projectId,
    player_id: playerId,
    date: r.date_key,
    dimension,
    value,
    viewed: num(r.total_viewed),
    plays: num(r.total_started),
    finished: num(r.total_finished),
    clicked: num(r.total_clicked),
    over_pitch: num(r.total_over_pitch),
    engagement_rate: num(r.engagement_rate),
    conversions: num(r.total_conversions),
    // A API devolve os valores em CENTAVOS → converte para a unidade principal.
    amount_brl: num(r.total_amount_brl) / 100,
    amount_usd: num(r.total_amount_usd) / 100,
    play_rate: num(r.play_rate),
    conversion_rate: num(r.overall_conversion_rate),
    synced_at: new Date().toISOString(),
  };
}

export type VturbPlan = "basic" | "pro" | "scale" | "enterprise";
/** Requisições/min por plano (doc VTurb). Usamos ~metade como margem segura. */
export const PLAN_RPM: Record<VturbPlan, number> = { basic: 60, pro: 120, scale: 300, enterprise: 800 };

/** Atualiza a LISTA de VSLs (barato: 1 GET). Não mexe na seleção (included). */
export async function refreshVturbPlayers(projectId: number): Promise<{ ok: boolean; count?: number; error?: string; skipped?: string }> {
  const token = await getVturbToken(projectId).catch(() => null);
  if (!token) return { ok: false, skipped: "no_credentials" };
  let players;
  try {
    players = await listPlayers(token);
  } catch (e) {
    return { ok: false, error: e instanceof VturbError ? e.message : "Falha ao listar VSLs." };
  }
  if (players.length) {
    const now = new Date().toISOString();
    // Não inclui 'included' no upsert → preserva a seleção existente.
    const { error } = await getSupabaseAdmin().from("vturb_players").upsert(
      players.map((p) => ({
        project_id: projectId, player_id: p.id, name: p.name,
        duration: p.duration ?? 0, pitch_time: p.pitch_time ?? 0,
        vturb_created_at: p.created_at ?? null, synced_at: now,
      })),
      { onConflict: "project_id,player_id" },
    );
    if (error) throw error;
  }
  return { ok: true, count: players.length };
}

export async function runVturbSync(projectId: number, opts?: { plan?: VturbPlan; sinceDays?: number }): Promise<VturbSyncResult> {
  const plan = opts?.plan ?? "basic";
  const sinceDays = opts?.sinceDays ?? 365;
  const token = await getVturbToken(projectId).catch(() => null);
  if (!token) return { ok: false, skipped: "no_credentials" };

  const supa = getSupabaseAdmin();
  const end = new Date();
  // Estes endpoints exigem datetime COM hora/min/seg (senão 400).
  const start_date = ymd(new Date(end.getTime() - sinceDays * 86400000)) + " 00:00:00";
  const end_date = ymd(end) + " 23:59:59";
  const delayMs = Math.max(150, Math.ceil(60000 / (PLAN_RPM[plan] * 0.5)));

  // Sincroniza SÓ as VSLs selecionadas (included=true).
  const { data: incl } = await supa.from("vturb_players")
    .select("player_id,name,duration,pitch_time").eq("project_id", projectId).eq("included", true);
  const players = (incl ?? []).map((p) => ({ id: p.player_id as string, name: p.name as string | null, duration: (p.duration as number) ?? 0, pitch_time: (p.pitch_time as number) ?? 0 }));
  if (players.length === 0) {
    return { ok: false, skipped: "no_players", error: "Nenhuma VSL selecionada. Atualize a lista e escolha as VSLs a sincronizar." };
  }

  let rows = 0;
  let errors = 0;
  let withData = 0;
  let firstError: string | null = null;
  const noteError = (e: unknown) => {
    errors++;
    if (!firstError) firstError = e instanceof VturbError ? `${e.status ?? ""} ${e.message}`.trim() : e instanceof Error ? e.message : String(e);
  };

  const upsert = async (records: ReturnType<typeof rowToRecord>[]) => {
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      const { error } = await supa.from("vturb_daily").upsert(chunk, { onConflict: "project_id,player_id,date,dimension,value" });
      if (error) throw error;
      rows += chunk.length;
    }
  };

  for (const p of players) {
    let got = 0;
    // Totais do vídeo por dia.
    try {
      const totals = await withRetry(() => sessionStatsByDay(token, { player_id: p.id, start_date, end_date, video_duration: p.duration || undefined }));
      const recs = totals.filter((r) => r.date_key).map((r) => rowToRecord(projectId, p.id, "total", "", r));
      await upsert(recs);
      got += recs.length;
    } catch (e) {
      noteError(e);
    }
    // Breakdown por UTM.
    try {
      const byUtm = await withRetry(() =>
        trafficOriginStatsByDay(token, {
          player_id: p.id,
          start_date,
          end_date,
          video_duration: p.duration || 1,
          query_keys: ["utm_campaign", "utm_content", "utm_source", "utm_medium"],
        }),
      );
      const recs = byUtm.filter((r) => r.date_key && r.query_key).map((r) => rowToRecord(projectId, p.id, r.query_key, r.grouped_field ?? "", r));
      await upsert(recs);
      got += recs.length;
    } catch (e) {
      noteError(e);
    }
    if (got > 0) withData++;
    await sleep(delayMs); // respeita o rate limit conforme o plano
  }

  return { ok: true, players: players.length, rows, withData, errors, firstError: firstError ?? undefined };
}
