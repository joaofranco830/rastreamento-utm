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

/** Segue paginação (paging.next) até esgotar, com teto de segurança. */
async function getAllPages(firstUrl: string): Promise<GraphRow[]> {
  const out: GraphRow[] = [];
  let next: string | null = firstUrl;
  let pages = 0;
  while (next && pages < 200) {
    const res: Response = await fetch(next, { cache: "no-store" });
    const json: {
      data?: GraphRow[];
      paging?: { next?: string };
      error?: { message: string; code: number; type?: string };
    } = await res.json();
    if (json.error) {
      const err: MetaError = new Error(`Meta API: ${json.error.message}`);
      err.metaCode = json.error.code;
      // 190 = token inválido/expirado; 102/10/200 = sessão/permissão
      err.isAuth = [190, 102, 10, 200, 463, 467].includes(json.error.code);
      throw err;
    }
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
