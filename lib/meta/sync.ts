import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  fetchInsights,
  fetchEntityStatuses,
  extractAction,
  extractActionTotal,
  extractMetric,
  normAccount,
  type MetaCreds,
  type MetaInsightRow,
} from "@/lib/meta/client";
import { getProjectMetaCreds } from "@/lib/meta/creds";

/**
 * Sincroniza os insights do Meta para a nossa base (ADR-2), AGORA POR PROJETO:
 * cada projeto tem suas próprias credenciais (cofre) e seu próprio BM/ad account.
 * lock → busca insights (janela recente) → upsert hierarquia + meta_insights_daily
 * (tudo carimbado com project_id) → liga attributions.ad_id → libera lock.
 * Idempotente (upsert por chaves únicas).
 */

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return isFinite(n) && n >= 0 ? n : 0;
};

type Supa = ReturnType<typeof getSupabaseAdmin>;

export interface SyncResult {
  ok: boolean;
  skipped?: string;
  project_id?: number;
  campaigns?: number;
  adsets?: number;
  ads?: number;
  insights?: number;
  ad_links?: number;
  error?: string;
}

/**
 * Núcleo do sync de UM projeto (assume lock já adquirido). Usa as credenciais
 * passadas e carimba project_id em toda escrita.
 */
async function syncProjectMeta(
  supa: Supa,
  projectId: number,
  creds: MetaCreds,
  sinceDays: number,
): Promise<SyncResult> {
  let campaigns = 0;
  let adsets = 0;
  let ads = 0;
  let insights = 0;

  // O projeto pode ter VÁRIAS contas de anúncio — sincroniza cada uma e soma.
  for (const account of creds.accounts) {
    const rows = await fetchInsights(creds.token, account, sinceDays);

    // status de veiculação por nível (endpoint separado dos insights)
    const [campStatus, adsetStatus, adStatus] = await Promise.all([
      fetchEntityStatuses(creds.token, account, "campaigns"),
      fetchEntityStatuses(creds.token, account, "adsets"),
      fetchEntityStatuses(creds.token, account, "ads"),
    ]);

    // hierarquia: upsert ad_account → campaigns → adsets → ads (resolve FKs)
    const accId = await upsertAdAccount(supa, projectId, account);
    const campMap = await upsertLevel(
      supa,
      "campaigns",
      dedupe(rows, "campaign_id", (r) => ({
        meta_id: r.campaign_id,
        name: r.campaign_name,
        ad_account_id: accId,
        effective_status: campStatus.get(r.campaign_id) ?? null,
        project_id: projectId,
      })),
    );
    const adsetMap = await upsertLevel(
      supa,
      "adsets",
      dedupe(rows, "adset_id", (r) => ({
        meta_id: r.adset_id,
        name: r.adset_name,
        campaign_id: campMap.get(r.campaign_id),
        effective_status: adsetStatus.get(r.adset_id) ?? null,
        project_id: projectId,
      })),
    );
    const adMap = await upsertLevel(
      supa,
      "ads",
      dedupe(rows, "ad_id", (r) => ({
        meta_id: r.ad_id,
        name: r.ad_name,
        adset_id: adsetMap.get(r.adset_id),
        effective_status: adStatus.get(r.ad_id) ?? null,
        project_id: projectId,
      })),
    );

    // meta_insights_daily (1 linha por ad+dia), carimbado com project_id
    const insightRows = rows
      .map((r) => {
        const ad_id = adMap.get(r.ad_id);
        if (!ad_id) return null;
        return {
          ad_id,
          date: r.date_start,
          spend: num(r.spend),
          impressions: num(r.impressions),
          clicks: num(r.clicks),
          link_clicks: num(r.inline_link_clicks),
          lpv: extractAction(r.actions, "landing_page_view"),
          ic: extractAction(r.actions, "omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout"),
          purchases: extractAction(r.actions, "omni_purchase", "offsite_conversion.fb_pixel_purchase"),
          leads: extractAction(r.actions, "lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"),
          // Seguidores: follows do perfil/página gerados pelo anúncio (total, não é conversão atribuída).
          follows: extractActionTotal(r.actions, "onsite_conversion.follow", "follow", "like"),
          video_3s: extractActionTotal(r.actions, "video_view"),
          video_p25: extractMetric(r.video_p25_watched_actions),
          video_p50: extractMetric(r.video_p50_watched_actions),
          video_p75: extractMetric(r.video_p75_watched_actions),
          video_p95: extractMetric(r.video_p95_watched_actions),
          video_p100: extractMetric(r.video_p100_watched_actions),
          video_plays: extractMetric(r.video_play_actions),
          synced_at: new Date().toISOString(),
          project_id: projectId,
        };
      })
      .filter(Boolean) as Record<string, unknown>[];

    for (let i = 0; i < insightRows.length; i += 500) {
      const chunk = insightRows.slice(i, i + 500);
      const { error } = await supa.from("meta_insights_daily").upsert(chunk, { onConflict: "ad_id,date" });
      if (error) throw error;
    }

    campaigns += campMap.size;
    adsets += adsetMap.size;
    ads += adMap.size;
    insights += insightRows.length;
  }

  // liga attributions.ad_id (utm_content -> ads.meta_id) agora que ads existe
  const { data: linked } = await supa.rpc("resolve_attribution_ads");

  return {
    ok: true,
    project_id: projectId,
    campaigns,
    adsets,
    ads,
    insights,
    ad_links: typeof linked === "number" ? linked : undefined,
  };
}

/** Sincroniza UM projeto (resolve credenciais no cofre/.env, sob lock). */
export async function runMetaSyncForProject(projectId: number, sinceDays = 14): Promise<SyncResult> {
  const supa = getSupabaseAdmin();
  const creds = await getProjectMetaCreds(projectId);
  if (!creds) return { ok: false, project_id: projectId, skipped: "no_credentials" };

  // lock (lease 5 min) — evita sync concorrente (login/cron/timer/refresh)
  const { data: gotLock, error: lockErr } = await supa.rpc("acquire_meta_sync_lock", {
    p_lease_seconds: 300,
  });
  if (lockErr) throw lockErr;
  if (!gotLock) return { ok: false, project_id: projectId, skipped: "locked" };

  try {
    const res = await syncProjectMeta(supa, projectId, creds, sinceDays);
    await supa.rpc("release_meta_sync_lock", { p_status: "ok", p_error: null });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supa.rpc("release_meta_sync_lock", { p_status: "error", p_error: msg.slice(0, 500) });
    return { ok: false, project_id: projectId, error: msg };
  }
}

/**
 * Sincroniza TODOS os projetos que têm credenciais do Meta (cron). Adquire o lock
 * uma vez e itera; se um projeto falhar, os outros seguem. O Projeto Padrão (1)
 * sempre entra (cai no .env quando não há credencial no cofre).
 */
export async function runMetaSyncAll(sinceDays = 14): Promise<SyncResult[]> {
  const supa = getSupabaseAdmin();

  // projetos ativos + o Padrão (1) sempre
  const { data: projs, error } = await supa.from("projects").select("id").order("id");
  if (error) throw error;
  const ids = new Set<number>([1]);
  for (const p of projs ?? []) ids.add(p.id as number);

  const results: SyncResult[] = [];
  for (const id of ids) {
    const creds = await getProjectMetaCreds(id);
    if (!creds) continue; // projeto sem Meta conectado — pula silenciosamente

    const { data: gotLock, error: lockErr } = await supa.rpc("acquire_meta_sync_lock", {
      p_lease_seconds: 300,
    });
    if (lockErr) throw lockErr;
    if (!gotLock) {
      results.push({ ok: false, project_id: id, skipped: "locked" });
      break; // outro sync em curso — não insiste
    }

    try {
      const res = await syncProjectMeta(supa, id, creds, sinceDays);
      await supa.rpc("release_meta_sync_lock", { p_status: "ok", p_error: null });
      results.push(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supa.rpc("release_meta_sync_lock", { p_status: "error", p_error: msg.slice(0, 500) });
      results.push({ ok: false, project_id: id, error: msg });
    }
  }

  return results;
}

// ---- helpers ----

async function upsertAdAccount(supa: Supa, projectId: number, account: string): Promise<number> {
  const meta = normAccount(account).replace(/^act_/, "");
  const { data, error } = await supa
    .from("ad_accounts")
    .upsert({ meta_account_id: meta, project_id: projectId }, { onConflict: "meta_account_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as number;
}

/** Linhas distintas por uma chave do insight, mapeadas para o formato da tabela. */
function dedupe(
  rows: MetaInsightRow[],
  key: keyof MetaInsightRow,
  map: (r: MetaInsightRow) => Record<string, unknown>,
): Record<string, unknown>[] {
  const seen = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const k = r[key] as string;
    if (k && !seen.has(k)) seen.set(k, map(r));
  }
  return [...seen.values()];
}

/** Upsert por meta_id; retorna Map<meta_id, id_no_banco>. */
async function upsertLevel(
  supa: Supa,
  table: "campaigns" | "adsets" | "ads",
  values: Record<string, unknown>[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (values.length === 0) return map;
  const { data, error } = await supa
    .from(table)
    .upsert(values, { onConflict: "meta_id" })
    .select("id,meta_id");
  if (error) throw error;
  for (const row of data ?? []) map.set(row.meta_id as string, row.id as number);
  return map;
}
