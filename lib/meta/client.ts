import "server-only";

/**
 * Cliente da Meta Marketing/Graph API (server-only). O token (System User) e o
 * ad account vêm de variáveis de ambiente — NUNCA no client.
 * Versão da API fixada (atualizar conscientemente).
 */
const GRAPH_VERSION = "v25.0";
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Janela de atribuição lida do Meta: alinha com nosso last-click 7d.
export const META_ATTR_WINDOW = "7d_click";

function token(): string {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("META_ACCESS_TOKEN ausente");
  return t;
}
function account(): string {
  let a = process.env.META_AD_ACCOUNT_ID;
  if (!a) throw new Error("META_AD_ACCOUNT_ID ausente");
  a = a.trim();
  return a.startsWith("act_") ? a : `act_${a}`;
}

export interface MetaError extends Error {
  metaCode?: number;
  isAuth?: boolean;
}

interface GraphRow {
  [k: string]: unknown;
}

const AUTH_CODES = [190, 102, 10, 200, 463, 467]; // token/sessão/permissão -> não adianta retry
const RATE_LIMIT_CODES = [4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004]; // cota -> retry com backoff
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GraphResponse {
  data?: GraphRow[];
  paging?: { next?: string };
  error?: { message: string; code: number; type?: string };
}

/** Busca uma página com retries/backoff em erros transitórios (rede, 429/5xx, cota). */
async function fetchPage(url: string, maxAttempts = 4): Promise<GraphResponse> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1)); // 500ms, 1s, 2s
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json: GraphResponse = await res.json();
      if (json.error) {
        const code = json.error.code;
        const isAuth = AUTH_CODES.includes(code);
        const transient = !isAuth && RATE_LIMIT_CODES.includes(code);
        if (transient && attempt < maxAttempts - 1) {
          lastErr = json.error;
          continue;
        }
        const err: MetaError = new Error(`Meta API: ${json.error.message}`);
        err.metaCode = code;
        err.isAuth = isAuth; // 190 = token expirado -> sinaliza reauth
        throw err;
      }
      if ((res.status >= 500 || res.status === 429) && attempt < maxAttempts - 1) {
        lastErr = new Error(`Meta API HTTP ${res.status}`);
        continue;
      }
      return json;
    } catch (e) {
      if (e instanceof Error && (e as MetaError).metaCode !== undefined) throw e; // erro Meta definitivo
      lastErr = e; // erro de rede -> retry
      if (attempt >= maxAttempts - 1) throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Meta API: falha após retries");
}

/** Segue paginação (paging.next) até esgotar, com teto de segurança. */
async function getAllPages(firstUrl: string): Promise<GraphRow[]> {
  const out: GraphRow[] = [];
  let next: string | null = firstUrl;
  let pages = 0;
  while (next && pages < 200) {
    const json = await fetchPage(next);
    out.push(...(json.data ?? []));
    next = json.paging?.next ?? null;
    pages++;
  }
  return out;
}

/** YYYY-MM-DD (UTC) — o Meta interpreta no fuso da conta (America/Sao_Paulo). */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface MetaInsightRow {
  ad_id: string;
  ad_name?: string;
  adset_id: string;
  adset_name?: string;
  campaign_id: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: Array<{ action_type: string; value?: string; [w: string]: unknown }>;
  date_start: string;
}

/** Insights por anúncio, 1 linha por (anúncio, dia), na janela recente. */
export async function fetchInsights(sinceDays = 14): Promise<MetaInsightRow[]> {
  const until = new Date();
  const since = new Date(until.getTime() - sinceDays * 86400000);
  const params = new URLSearchParams({
    level: "ad",
    fields:
      "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,actions,date_start",
    action_attribution_windows: JSON.stringify([META_ATTR_WINDOW]),
    time_increment: "1",
    time_range: JSON.stringify({ since: ymd(since), until: ymd(until) }),
    limit: "500",
    access_token: token(),
  });
  const data = await getAllPages(`${BASE}/${account()}/insights?${params.toString()}`);
  return data as unknown as MetaInsightRow[];
}

/** Extrai o valor de um action_type (prefere a janela 7d_click; senão o total). */
export function extractAction(
  actions: MetaInsightRow["actions"],
  ...types: string[]
): number {
  if (!actions) return 0;
  for (const type of types) {
    const a = actions.find((x) => x.action_type === type);
    if (a) {
      const raw = (a[META_ATTR_WINDOW] as string) ?? a.value ?? "0";
      const n = Math.round(Number(raw));
      return isFinite(n) ? n : 0;
    }
  }
  return 0;
}
