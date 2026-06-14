import { isValidVisitorId } from "@/lib/config";

/**
 * Parsing PURO do payload do Webhook 2.0 da Hotmart (sem I/O, testável).
 * Caminhos confirmados por pesquisa; itens marcados como "validar no sandbox"
 * podem precisar de ajuste após o primeiro webhook real (raw_payload é guardado).
 */

export type HotmartEffect = "active" | "removed" | "partial" | "ignore";

export interface ParsedHotmart {
  eventId: string | null; // envelope.id (ou fallback determinístico) — dedupe
  eventName: string | null; // ex.: PURCHASE_APPROVED
  transaction: string | null; // chave única do pedido
  statusNorm: string; // status canônico em minúsculas ('unknown' se ausente)
  effect: HotmartEffect;
  grossValue: number; // valor bruto (0 se desconhecido)
  eventValue: number | null; // valor associado ao evento (estorno no parcial)
  orderDate: string | null; // ISO; data da venda original (coorte)
  visitorId: string | null; // origin.src validado (ou null)
  contactEmail: string | null;
  contactPhone: string | null;
}

// status canônico (sem prefixo PURCHASE_) -> efeito no faturamento (ADR-4)
const EFFECT_BY_STATUS: Record<string, HotmartEffect> = {
  APPROVED: "active",
  COMPLETE: "active",
  COMPLETED: "active",
  REFUNDED: "removed",
  CHARGEBACK: "removed",
  CANCELED: "removed",
  CANCELLED: "removed",
  PARTIALLY_REFUNDED: "partial",
  // demais (STARTED, WAITING_PAYMENT, BILLET_PRINTED, PROCESSING_TRANSACTION,
  // UNDER_ANALISYS, EXPIRED, NO_FUNDS, OVERDUE, BLOCKED, PRE_ORDER, PROTEST,
  // DISPUTE...) caem em "ignore": registram o evento, não mexem no valor.
};

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function money(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/** epoch ms (number ou string) -> ISO. Aceita também ISO direto. */
function toIso(v: unknown): string | null {
  if (typeof v === "number" && isFinite(v)) return new Date(v).toISOString();
  if (typeof v === "string" && v) {
    const asNum = Number(v);
    const d = isFinite(asNum) && v.trim() !== "" ? new Date(asNum) : new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export function parseHotmartPayload(body: unknown): ParsedHotmart {
  const root = obj(body);
  const data = obj(root.data);
  const purchase = obj(data.purchase);
  const buyer = obj(data.buyer);
  const origin = obj(purchase.origin);
  const price = obj(purchase.price);
  const fullPrice = obj(purchase.full_price);

  const eventName = str(root.event);
  // status canônico: prioriza purchase.status; senão deriva do nome do evento.
  const rawStatus = str(purchase.status) || (eventName ? eventName.replace(/^PURCHASE_/, "") : null);
  const canon = (rawStatus || "").toUpperCase();
  const effect = EFFECT_BY_STATUS[canon] ?? "ignore";
  // nunca null: order_events.type é NOT NULL (evita 500 + retry infinito).
  const statusNorm = canon ? canon.toLowerCase() : "unknown";

  // visitor_id vem em origin.src — minúsculo e validado contra a regra de ouro.
  let visitorId: string | null = null;
  const srcRaw = str(origin.src);
  if (srcRaw) {
    const candidate = srcRaw.trim().toLowerCase();
    visitorId = isValidVisitorId(candidate) ? candidate : null;
  }

  const grossValue = money(price.value ?? fullPrice.value);

  // valor do evento: parcial usa o valor estornado (caminho a validar no sandbox);
  // removed usa o bruto; active usa o bruto; ignore não tem valor relevante.
  const refundCandidate =
    money(obj(purchase.refund).value) ||
    money((purchase as Record<string, unknown>).refund_value) ||
    money(obj(data.refund).value);
  let eventValue: number | null;
  if (effect === "partial") eventValue = refundCandidate || null;
  else if (effect === "removed" || effect === "active") eventValue = grossValue;
  else eventValue = null;

  const transaction = str(purchase.transaction);
  const orderDate = toIso(purchase.order_date) || toIso(purchase.approved_date);

  // event_id é a chave de dedupe (idempotência). Se a Hotmart não mandar o id do
  // envelope, derivamos uma chave determinística do conteúdo do evento: re-entregas
  // do MESMO evento colidem (deduplicam), mas estornos parciais distintos não
  // (creation_date difere entre eventos distintos).
  const creationIso = toIso(root.creation_date);
  const eventId =
    str(root.id) ||
    (transaction
      ? `fb:${transaction}:${statusNorm}:${eventValue ?? ""}:${creationIso ?? orderDate ?? ""}`
      : null);

  return {
    eventId,
    eventName,
    transaction,
    statusNorm,
    effect,
    grossValue,
    eventValue,
    orderDate,
    visitorId,
    contactEmail: str(buyer.email),
    contactPhone: str(buyer.checkout_phone) || str(buyer.phone),
  };
}
