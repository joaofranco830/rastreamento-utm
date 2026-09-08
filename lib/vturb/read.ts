import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Leitura do Analytics do VSL (VTurb) por projeto, via sessão (RLS). Agrega as
 * linhas diárias de vturb_daily no período: por vídeo (dimension='total') e por
 * campanha/criativo (dimension='utm_campaign'/'utm_content'). Taxas são
 * RECALCULADAS a partir dos totais (não somadas); engajamento é média ponderada
 * por views.
 */

export interface VslMetrics {
  viewed: number;
  plays: number;
  finished: number;
  clicked: number;
  over_pitch: number;
  conversions: number;
  amount_brl: number;
  engagement_rate: number; // % média ponderada por views
  play_rate: number; // plays / viewed
  conversion_rate: number; // conversions / plays
  over_pitch_rate: number; // over_pitch / viewed
}

export interface VslVideo extends VslMetrics {
  player_id: string;
  name: string | null;
  duration: number;
  pitch_time: number;
}

export interface VslBreakdownRow extends VslMetrics {
  value: string;
}

interface DailyRow {
  player_id: string;
  dimension: string;
  value: string;
  viewed: number | string;
  plays: number | string;
  finished: number | string;
  clicked: number | string;
  over_pitch: number | string;
  engagement_rate: number | string;
  conversions: number | string;
  amount_brl: number | string;
}

const n = (v: unknown) => Number(v) || 0;

function aggregate(rows: DailyRow[]): VslMetrics {
  let viewed = 0, plays = 0, finished = 0, clicked = 0, over_pitch = 0, conversions = 0, amount_brl = 0, engW = 0;
  for (const r of rows) {
    const v = n(r.viewed);
    viewed += v;
    plays += n(r.plays);
    finished += n(r.finished);
    clicked += n(r.clicked);
    over_pitch += n(r.over_pitch);
    conversions += n(r.conversions);
    amount_brl += n(r.amount_brl);
    engW += n(r.engagement_rate) * v; // ponderar engajamento por views
  }
  return {
    viewed, plays, finished, clicked, over_pitch, conversions, amount_brl,
    engagement_rate: viewed > 0 ? engW / viewed : 0,
    play_rate: viewed > 0 ? (plays / viewed) * 100 : 0,
    conversion_rate: plays > 0 ? (conversions / plays) * 100 : 0,
    over_pitch_rate: viewed > 0 ? (over_pitch / viewed) * 100 : 0,
  };
}

function groupBy(rows: DailyRow[], key: (r: DailyRow) => string): Map<string, DailyRow[]> {
  const m = new Map<string, DailyRow[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k) ?? [];
    arr.push(r);
    m.set(k, arr);
  }
  return m;
}

export interface VslPlayerOption {
  player_id: string;
  name: string | null;
  included: boolean;
  duration: number;
}

export interface VslData {
  videos: VslVideo[];
  byCampaign: VslBreakdownRow[];
  byContent: VslBreakdownRow[];
  players: VslPlayerOption[];
  lastSync: string | null;
  hasKey: boolean;
}

export async function getVslData(projectId: number, from: string, to: string): Promise<VslData> {
  const supabase = await createClient();
  const [dailyRes, playersRes] = await Promise.all([
    supabase.from("vturb_daily").select("player_id,dimension,value,viewed,plays,finished,clicked,over_pitch,engagement_rate,conversions,amount_brl")
      .eq("project_id", projectId).gte("date", from).lte("date", to),
    supabase.from("vturb_players").select("player_id,name,duration,pitch_time,included,synced_at").eq("project_id", projectId).order("name"),
  ]);
  const daily = (dailyRes.data ?? []) as DailyRow[];
  const players = (playersRes.data ?? []) as { player_id: string; name: string | null; duration: number; pitch_time: number; included: boolean; synced_at: string }[];
  const pMap = new Map(players.map((p) => [p.player_id, p]));
  const lastSync = players.reduce<string | null>((max, p) => (!max || p.synced_at > max ? p.synced_at : max), null);

  const totals = daily.filter((d) => d.dimension === "total");
  const videos: VslVideo[] = [...groupBy(totals, (r) => r.player_id).entries()]
    .map(([pid, rows]) => {
      const p = pMap.get(pid);
      return { player_id: pid, name: p?.name ?? pid, duration: p?.duration ?? 0, pitch_time: p?.pitch_time ?? 0, ...aggregate(rows) };
    })
    .sort((a, b) => b.conversions - a.conversions || b.viewed - a.viewed);

  const breakdown = (dim: string): VslBreakdownRow[] =>
    [...groupBy(daily.filter((d) => d.dimension === dim && d.value), (r) => r.value).entries()]
      .map(([value, rows]) => ({ value, ...aggregate(rows) }))
      .sort((a, b) => b.conversions - a.conversions || b.viewed - a.viewed);

  return {
    videos,
    byCampaign: breakdown("utm_campaign"),
    byContent: breakdown("utm_content"),
    players: players.map((p) => ({ player_id: p.player_id, name: p.name, included: !!p.included, duration: p.duration ?? 0 })),
    lastSync,
    hasKey: true,
  };
}
