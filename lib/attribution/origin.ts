/**
 * Tipos e leitura do campo attributions.origin (JSON serializado em texto).
 * A ESCRITA é feita no SQL (RPC attribute_order); aqui só lemos (dashboard/tests).
 */

export type OriginClass =
  | "paid_meta"
  | "paid_meta_fbclid"
  | "other_utm"
  | "organic"
  | "referral"
  | "direct";

export interface AttributionOrigin {
  class: OriginClass | string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  fbclid?: string | null;
  referrer?: string | null;
  page?: string | null;
  touchpoint_id?: number;
  touchpoint_ts?: string;
  via?: string; // 'contact_fallback' quando casou por contato
}

export function parseOrigin(origin: string | null | undefined): AttributionOrigin | null {
  if (!origin) return null;
  try {
    return JSON.parse(origin) as AttributionOrigin;
  } catch {
    return null;
  }
}

/** É tráfego pago do Meta (entra no denominador de gasto/ROAS)? */
export function isPaidMeta(o: AttributionOrigin | null): boolean {
  return !!o && (o.class === "paid_meta" || o.class === "paid_meta_fbclid");
}

/** Rótulo curto para o dashboard. */
export function originLabel(o: AttributionOrigin | null): string {
  if (!o) return "Sem atribuição";
  if (o.class === "paid_meta") return o.utm_campaign || o.utm_content || "Meta (pago)";
  if (o.class === "paid_meta_fbclid") return "Meta (anúncio não identificado)";
  if (o.class === "organic") return "Orgânico";
  if (o.class === "referral") return o.referrer || "Referência";
  if (o.class === "direct") return "Direto";
  return o.utm_source || "Outro";
}
