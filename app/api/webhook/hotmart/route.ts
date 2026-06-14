import "server-only";
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseHotmartPayload } from "@/lib/sales/hotmart";
import { hashContact } from "@/lib/sales/contact-hash";

export const runtime = "nodejs"; // node:crypto + service_role -> não edge
export const dynamic = "force-dynamic"; // webhook nunca é cacheado

/**
 * POST /api/webhook/hotmart — receptor do Webhook 2.0 da Hotmart.
 * Valida o Hottok, é idempotente (dedupe por event_id) e aplica a venda/reembolso
 * de forma atômica via RPC apply_hotmart_event (ADR-4: líquido + coorte).
 */

// Comparação segura (constante no tempo). Compara hashes de tamanho fixo para
// não vazar o comprimento nem lançar exceção por tamanhos diferentes.
function hottokMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.HOTMART_HOTTOK;
  if (!expected) {
    // Misconfiguração nossa (não da Hotmart): falha fechada.
    console.error("[webhook] HOTMART_HOTTOK ausente no servidor");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Ler o corpo como texto e parsear (não confiar no Content-Type).
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Hottok: header (esperado) com fallback ao corpo. Nunca logar o valor.
  const headerTok = req.headers.get("x-hotmart-hottok");
  const bodyTok =
    body && typeof body === "object"
      ? ((body as Record<string, unknown>).hottok as string | undefined) ?? null
      : null;
  const token = headerTok || bodyTok || null;
  if (!hottokMatches(token, expected)) {
    console.warn("[webhook] hottok inválido — requisição rejeitada");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Correlação para logs de erro (sem PII).
  let txn: string | null = null;
  let evId: string | null = null;

  // A partir daqui o evento é confiável.
  try {
    const parsed = parseHotmartPayload(body);
    if (!parsed.transaction) {
      // Payload estruturalmente inválido: re-tentar não ajuda -> 200 + log.
      console.warn("[webhook] payload sem transaction; ignorado");
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
    }
    txn = parsed.transaction;
    evId = parsed.eventId;

    // Alerta defensivo: reembolso parcial sem valor estornado (caminho do payload
    // a confirmar no sandbox). Sem PII. Permite detectar o caso em produção.
    if (parsed.effect === "partial" && parsed.eventValue == null) {
      console.warn("[webhook] parcial sem valor estornado (validar caminho do payload)", {
        transaction: parsed.transaction,
      });
    }

    const contactHash = hashContact(parsed.contactEmail, parsed.contactPhone);
    const supa = getSupabaseAdmin();

    const { data, error } = await supa.rpc("apply_hotmart_event", {
      p_transaction: parsed.transaction,
      p_event_id: parsed.eventId,
      p_event_type: parsed.statusNorm,
      p_event_value: parsed.eventValue,
      p_effect: parsed.effect,
      p_visitor_id: parsed.visitorId,
      p_contact_hash: contactHash,
      p_gross: parsed.grossValue,
      p_order_date: parsed.orderDate,
      p_status: parsed.statusNorm,
      p_raw: body,
    });
    if (error) throw error;

    // data === 'processed' | 'duplicate' (ambos são sucesso idempotente).
    return NextResponse.json({ ok: true, result: data }, { status: 200 });
  } catch (err) {
    // Erro interno (ex.: banco): 5xx para a Hotmart re-tentar (histórico 60 dias).
    // Loga só código + correlação não-PII — nunca o erro cru (o DETAIL do Postgres
    // poderia conter o raw_payload com e-mail/telefone/CPF do comprador).
    const code = (err as { code?: string } | null)?.code;
    console.error("[webhook] falha ao processar evento", { code, transaction: txn, eventId: evId });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
