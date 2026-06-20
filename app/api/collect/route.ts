export const runtime = "nodejs"; // precisa do service_role (segredo) -> não edge
export const dynamic = "force-dynamic"; // ingestão nunca é cacheada

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isValidVisitorId } from "@/lib/config";
import { allow } from "@/lib/ratelimit";

/**
 * POST /api/collect — recebe eventos do script de rastreio (t.js), que roda em
 * páginas de funil (em outro domínio) e envia via navigator.sendBeacon.
 *
 * Decisões (ver design da Fase 1):
 * - Corpo chega como text/plain (sendBeacon) -> ler req.text() + JSON.parse.
 * - visitor_id validado ANTES de tocar o banco (bate com o CHECK do schema).
 * - Sucesso E descarte silencioso respondem 204 (o client ignora o corpo).
 * - Escrita via service_role (RLS ligado sem políticas).
 */

const ALLOWED_EVENT_TYPES = ["pageview", "checkout_iniciado"] as const;
type EventType = (typeof ALLOWED_EVENT_TYPES)[number];

const MAX_BODY_BYTES = 8 * 1024; // 8 KB — barreira contra payload gigante

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // sem credenciais; restringir na Fase 6
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// LISTA BRANCA de parâmetros de atribuição. Ao gravar url/referrer, guardamos
// SÓ estes da querystring e descartamos todo o resto (mais seguro contra PII do
// que tentar adivinhar nomes sensíveis). O app só precisa destes para atribuir.
const KEEP_QS_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "src", "sck",
];

function noContent(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function clamp(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;
}

// device_type a partir do user-agent (server-side). Heurística simples e barata.
function deviceFromUA(ua: string | null): string | null {
  if (!ua) return null;
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk|android(?!.*mobile)/.test(s)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/.test(s)) return "mobile";
  return "desktop";
}

// Mantém só os parâmetros de atribuição da querystring. Descarta o fragmento (#)
// e qualquer outro parâmetro (que poderia conter e-mail/telefone/CPF). Cobre URL
// absoluta, relativa e lixo.
function keepAttribution(search: URLSearchParams): string {
  const kept = new URLSearchParams();
  for (const k of KEEP_QS_KEYS) {
    const v = search.get(k);
    if (v) kept.set(k, v);
  }
  const s = kept.toString();
  return s ? "?" + s : "";
}

function sanitizeUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl); // absoluta (caso real: location.href / referrer)
    return (u.origin + u.pathname + keepAttribution(u.searchParams)).slice(0, 2048);
  } catch {
    try {
      const u = new URL(rawUrl, "http://_"); // relativa
      return (u.pathname + keepAttribution(u.searchParams)).slice(0, 2048);
    } catch {
      // nem parseável: descarta querystring e fragmento manualmente
      return rawUrl.split("#")[0].split("?")[0].slice(0, 2048);
    }
  }
}

export async function OPTIONS(): Promise<Response> {
  // Preflight (caso o fallback fetch dispare). 204 rápido.
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request): Promise<Response> {
  // Rate limit best-effort por IP (60 req / 10s) — contém floods sem derrubar.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allow(`collect:${ip}`, 60, 10_000)) {
    return noContent(); // descarta silencioso sob flood (cliente ignora a resposta)
  }
  try {
    // 1) Corpo cru + limite de tamanho.
    const raw = await req.text();
    if (!raw || raw.length > MAX_BODY_BYTES) return noContent();

    // 2) Parse defensivo.
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return noContent();
    }
    if (typeof body !== "object" || body === null) return noContent();
    const p = body as Record<string, unknown>;

    // 3) Validar visitor_id (regra de ouro) e type ANTES do banco.
    const visitorId = typeof p.visitor_id === "string" ? p.visitor_id : "";
    if (!isValidVisitorId(visitorId)) return noContent(); // descarta silencioso

    const typeRaw = p.type;
    if (
      typeof typeRaw !== "string" ||
      !ALLOWED_EVENT_TYPES.includes(typeRaw as EventType)
    ) {
      return noContent();
    }
    const type = typeRaw as EventType;

    // 4) Allow-list + truncamento.
    const utm = {
      utm_source: clamp(p.utm_source, 255),
      utm_medium: clamp(p.utm_medium, 255),
      utm_campaign: clamp(p.utm_campaign, 255),
      utm_term: clamp(p.utm_term, 255),
      utm_content: clamp(p.utm_content, 255),
    };
    const fbclid = clamp(p.fbclid, 512);
    const referrer = sanitizeUrl(clamp(p.referrer, 2048));
    const page = sanitizeUrl(clamp(p.page, 1024)); // sanitiza também (vetor de PII)
    const url = sanitizeUrl(clamp(p.url, 2048));

    // Sinais do visitante (ADR-v2-4). UA/geo/IP vêm dos headers (servidor é a
    // fonte de verdade do IP); fbp/fbc vêm do corpo (cookies do funil). Geo é
    // preenchido pela Vercel em produção (vazio em dev local).
    const ua = req.headers.get("user-agent");
    const realIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const geoCity = req.headers.get("x-vercel-ip-city");
    const signals: Record<string, string> = {};
    if (realIp && realIp !== "unknown") signals.ip = realIp.slice(0, 64);
    const geoCountry = req.headers.get("x-vercel-ip-country");
    const geoRegion = req.headers.get("x-vercel-ip-country-region");
    if (geoCountry) signals.geo_country = geoCountry.slice(0, 8);
    if (geoRegion) signals.geo_region = geoRegion.slice(0, 32);
    if (geoCity) signals.geo_city = decodeURIComponent(geoCity).slice(0, 128);
    if (ua) signals.user_agent = ua.slice(0, 512);
    const device = deviceFromUA(ua);
    if (device) signals.device_type = device;
    const fbp = clamp(p.fbp, 255);
    const fbc = clamp(p.fbc, 512);
    if (fbp) signals.fbp = fbp;
    if (fbc) signals.fbc = fbc;

    const hasOrigin = !!(
      utm.utm_source ||
      utm.utm_medium ||
      utm.utm_campaign ||
      utm.utm_term ||
      utm.utm_content ||
      fbclid
    );

    const supa = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    // 5) visitors: cria se novo (preserva first_touch); sempre atualiza last_touch.
    const { error: insErr } = await supa.from("visitors").upsert(
      { visitor_id: visitorId, first_touch: nowIso, last_touch: nowIso },
      { onConflict: "visitor_id", ignoreDuplicates: true },
    );
    if (insErr) throw insErr;

    // last_touch sempre; sinais só quando presentes (não sobrescreve com null —
    // ex.: um pageview sem fbp não apaga o fbp já capturado antes).
    const { error: updErr } = await supa
      .from("visitors")
      .update({ last_touch: nowIso, ...signals })
      .eq("visitor_id", visitorId);
    if (updErr) throw updErr;

    // 6) touchpoint: só quando há origem; pula se idêntico ao último (dedup).
    if (hasOrigin) {
      const { data: last } = await supa
        .from("touchpoints")
        .select("utm_source,utm_medium,utm_campaign,utm_term,utm_content,fbclid")
        .eq("visitor_id", visitorId)
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isDuplicate =
        !!last &&
        last.utm_source === utm.utm_source &&
        last.utm_medium === utm.utm_medium &&
        last.utm_campaign === utm.utm_campaign &&
        last.utm_term === utm.utm_term &&
        last.utm_content === utm.utm_content &&
        last.fbclid === fbclid;

      if (!isDuplicate) {
        const { error: tpErr } = await supa.from("touchpoints").insert({
          visitor_id: visitorId,
          ...utm,
          fbclid,
          referrer,
          page,
        });
        if (tpErr) throw tpErr;
      }
    }

    // 7) tracking_event sempre. funnel_id fica null na Fase 1 (sem funis cadastrados).
    const { error: evErr } = await supa.from("tracking_events").insert({
      visitor_id: visitorId,
      type,
      url,
      funnel_id: null,
    });
    if (evErr) throw evErr;

    return noContent();
  } catch (err) {
    // Loga no servidor (Vercel), nunca vaza detalhe nem quebra a página.
    console.error("[collect] falha ao gravar evento:", err);
    return noContent();
  }
}
