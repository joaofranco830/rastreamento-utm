import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchInsights, extractAction, type MetaInsightRow } from "@/lib/meta/client";

/**
 * Sincroniza os insights do Meta para a nossa base (ADR-2):
 * lock → busca insights (janela recente) → upsert hierarquia + meta_insights_daily
 * → liga attributions.ad_id → libera lock. Idempotente (upsert por chaves únicas).
 */

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return isFinite(n) && n >= 0 ? n : 0;
};

export interface SyncResult {
  ok: boolean;
  skipped?: string;
  campaigns?: number;
  adsets?: number;
  ads?: number;
  insights?: number;
  ad_links?: number;
  error?: string;
}

export async function runMetaSync(sinceDays = 14): Promise<SyncResult> {
  const supa = getSupabaseAdmin();

  // 1) lock (lease 5 min) — evita sync concorrente (login/cron/timer/refresh)
  const { data: gotLock, error: lockErr } = await supa.rpc("acquire_meta_sync_lock", {
    p_lease_seconds: 300,
  });
  if (lockErr) throw lockErr;
  if (!gotLock) return { ok: false, skipped: "locked" };

  try {
    const rows = await fetchInsights(sinceDays);

    // 2) hierarquia: upsert ad_account → campaigns → adsets → ads (resolve FKs)
    const accId = await upsertAdAccount(supa);
    const campMap = await upsertLevel(
      supa,
      "campaigns",
      dedupe(rows, "campaign_id", (r) => ({ meta_id: r.campaign_id, name: r.campaign_name, ad_account_id: accId })),
    );
    const adsetMap = await upsertLevel(
      supa,
      "adsets",
      dedupe(rows, "adset_id", (r) => ({ meta_id: r.adset_id, name: r.adset_name, campaign_id: campMap.get(r.campaign_id) })),
    );
    const adMap = await upsertLevel(
      supa,
      "ads",
      dedupe(rows, "ad_id", (r) => ({ meta_id: r.ad_id, name: r.ad_name, adset_id: adsetMap.get(r.adset_id) })),
    );

    // 3) meta_insights_daily (1 linha por ad+dia)
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
          synced_at: new Date().toISOString(),
        };
      })
      .filter(Boolean) as Record<string, unknown>[];

    for (let i = 0; i < insightRows.length; i += 500) {
      const chunk = insightRows.slice(i, i + 500);
      const { error } = await supa.from("meta_insights_daily").upsert(chunk, { onConflict: "ad_id,date" });
      if (error) throw error;
    }

    // 4) liga attributions.ad_id (utm_content -> ads.meta_id) agora que ads existe
    const { data: linked } = await supa.rpc("resolve_attribution_ads");

    await supa.rpc("release_meta_sync_lock", { p_status: "ok", p_error: null });
    return {
      ok: true,
      campaigns: campMap.size,
      adsets: adsetMap.size,
      ads: adMap.size,
      insights: insightRows.length,
      ad_links: typeof linked === "number" ? linked : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supa.rpc("release_meta_sync_lock", { p_status: "error", p_error: msg.slice(0, 500) });
    return { ok: false, error: msg };
  }
}

// ---- helpers ----

async function upsertAdAccount(supa: ReturnType<typeof getSupabaseAdmin>): Promise<number> {
  const meta = (process.env.META_AD_ACCOUNT_ID ?? "").replace(/^act_/, "");
  const { data, error } = await supa
    .from("ad_accounts")
    .upsert({ meta_account_id: meta }, { onConflict: "meta_account_id" })
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
  supa: ReturnType<typeof getSupabaseAdmin>,
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
