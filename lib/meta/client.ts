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

export interface MetaCreds {
  token: string;
  /** Uma ou mais contas de anúncio (ids sem prefixo obrigatório; normalizados no uso). */
  accounts: string[];
}

export function normAccount(a: string): string {
  const t = (a ?? "").trim();
  return t.startsWith("act_") ? t : `act_${t}`;
}

/** Credenciais do Meta do `.env` (usadas pelo Projeto Padrão/cliente enquanto não migram pro cofre). */
export function envMetaCreds(): MetaCreds | null {
  const t = process.env.META_ACCESS_TOKEN;
  const a = process.env.META_AD_ACCOUNT_ID;
  return t && a ? { token: t, accounts: [a] } : null;
}

/** Lista as contas de anúncio que o token enxerga (passo "testar conexão" do wizard). */
export async function listAdAccounts(tok: string): Promise<{ id: string; name: string }[]> {
  const params = new URLSearchParams({ fields: "account_id,name", limit: "200", access_token: tok });
  const data = await getAllPages(`${BASE}/me/adaccounts?${params.toString()}`);
  return data
    .map((r) => ({ id: (r.account_id as string) ?? "", name: (r.name as string) ?? "" }))
    .filter((x) => x.id);
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
  // Vídeo: cada campo é um array de actions com `value` (vazio em estático).
  // (views de 3s vêm de actions[action_type=video_view] — não há campo dedicado.)
  video_p75_watched_actions?: Array<{ value?: string; [w: string]: unknown }>;
  video_p95_watched_actions?: Array<{ value?: string; [w: string]: unknown }>;
  video_play_actions?: Array<{ value?: string; [w: string]: unknown }>;
  date_start: string;
}

const INSIGHT_FIELDS =
  "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,actions," +
  "video_p75_watched_actions,video_p95_watched_actions,video_play_actions,date_start";
const CHUNK_DAYS = 90; // janelas <=90 dias — o Meta rejeita time_range muito grande de uma vez

/** Uma janela de insights (until exclusivo-de-mais-1-dia é tratado pelo Meta). */
async function fetchInsightsWindow(
  token: string,
  account: string,
  since: Date,
  until: Date,
): Promise<MetaInsightRow[]> {
  const params = new URLSearchParams({
    level: "ad",
    fields: INSIGHT_FIELDS,
    action_attribution_windows: JSON.stringify([META_ATTR_WINDOW]),
    time_increment: "1",
    time_range: JSON.stringify({ since: ymd(since), until: ymd(until) }),
    limit: "500",
    access_token: token,
  });
  const data = await getAllPages(`${BASE}/${normAccount(account)}/insights?${params.toString()}`);
  return data as unknown as MetaInsightRow[];
}

/**
 * Insights por anúncio de UMA conta, 1 linha por (anúncio, dia). Janelas longas
 * (>90 dias) são divididas em pedaços de <=90 dias e concatenadas.
 */
export async function fetchInsights(token: string, account: string, sinceDays = 14): Promise<MetaInsightRow[]> {
  const end = new Date();
  const start = new Date(end.getTime() - sinceDays * 86400000);
  const out: MetaInsightRow[] = [];
  let winSince = start;
  while (winSince < end) {
    const winUntil = new Date(Math.min(winSince.getTime() + CHUNK_DAYS * 86400000, end.getTime()));
    const rows = await fetchInsightsWindow(token, account, winSince, winUntil);
    out.push(...rows);
    // próximo pedaço começa no dia seguinte ao fim deste (evita sobreposição de 1 dia)
    winSince = new Date(winUntil.getTime() + 86400000);
  }
  return out;
}

/**
 * Busca o effective_status (veiculação) de todas as entidades de um nível.
 * Endpoint separado: o status NÃO vem nos insights. Retorna Map<meta_id, status>.
 */
export async function fetchEntityStatuses(
  token: string,
  account: string,
  level: "campaigns" | "adsets" | "ads",
): Promise<Map<string, string>> {
  const params = new URLSearchParams({
    fields: "id,effective_status",
    limit: "500",
    access_token: token,
  });
  const data = await getAllPages(`${BASE}/${normAccount(account)}/${level}?${params.toString()}`);
  const m = new Map<string, string>();
  for (const r of data) {
    const id = r.id as string | undefined;
    const st = r.effective_status as string | undefined;
    if (id && st) m.set(id, st);
  }
  return m;
}

/**
 * Soma o valor TOTAL de um campo de action de vídeo. Vídeo NÃO é métrica de
 * conversão — usar o total (`value`), nunca a janela de atribuição (7d_click),
 * senão plays/p75 ficam inconsistentes (retenção dá >100%).
 */
export function extractMetric(
  arr?: Array<{ value?: string; [w: string]: unknown }>,
): number {
  if (!arr || arr.length === 0) return 0;
  let sum = 0;
  for (const a of arr) {
    const n = Number(a.value ?? "0");
    if (isFinite(n)) sum += n;
  }
  return Math.round(sum);
}

/** Igual a extractAction, mas usa o TOTAL (sem janela) — para vídeo (video_view). */
export function extractActionTotal(
  actions: MetaInsightRow["actions"],
  ...types: string[]
): number {
  if (!actions) return 0;
  for (const type of types) {
    const a = actions.find((x) => x.action_type === type);
    if (a) {
      const n = Math.round(Number(a.value ?? "0"));
      return isFinite(n) ? n : 0;
    }
  }
  return 0;
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
