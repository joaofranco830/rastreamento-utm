import "server-only";
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseHotmartPayload } from "@/lib/sales/hotmart";
import { hashContact } from "@/lib/sales/contact-hash";

/**
 * Núcleo do receptor do Webhook 2.0 da Hotmart, compartilhado entre a rota
 * legada (/api/webhook/hotmart -> Projeto Padrão) e a rota por projeto
 * (/api/webhook/hotmart/{endpoint_key}). Valida o Hottok do PROJETO, é
 * idempotente (dedupe por event_id) e carimba o project_id na RPC
 * apply_hotmart_event (ADR-v3-8). Nunca loga PII.
 */

// Comparação segura (constante no tempo) por hash de tamanho fixo.
export function hottokMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function handleHotmartWebhook(
  req: Request,
  projectId: number,
  expectedHottok: string | null,
): Promise<Response> {
  if (!expectedHottok) {
    // Projeto sem Hottok configurado (cofre + env vazios): misconfig nossa.
    console.error("[webhook] Hottok ausente para o projeto", { projectId });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

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

  const headerTok = req.headers.get("x-hotmart-hottok");
  const bodyTok =
    body && typeof body === "object"
      ? ((body as Record<string, unknown>).hottok as string | undefined) ?? null
      : null;
  const token = headerTok || bodyTok || null;
  if (!hottokMatches(token, expectedHottok)) {
    console.warn("[webhook] hottok inválido — requisição rejeitada", { projectId });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let txn: string | null = null;
  let evId: string | null = null;

  try {
    const parsed = parseHotmartPayload(body);
    if (!parsed.transaction) {
      console.warn("[webhook] payload sem transaction; ignorado", { projectId });
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
    }
    txn = parsed.transaction;
    evId = parsed.eventId;

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
      p_project_id: projectId,
    });
    if (error) throw error;

    // Enriquecimento best-effort (escopado ao projeto). Nunca derruba o webhook.
    try {
      const buyerPatch: Record<string, unknown> = {};
      if (parsed.productId) buyerPatch.product_id = parsed.productId;
      if (parsed.contactEmail) buyerPatch.buyer_email = parsed.contactEmail;
      if (parsed.buyerName) buyerPatch.buyer_name = parsed.buyerName;
      if (parsed.contactPhone) buyerPatch.buyer_phone = parsed.contactPhone;
      if (parsed.buyerDocument) buyerPatch.buyer_document = parsed.buyerDocument;
      if (parsed.buyerAddress) buyerPatch.buyer_address = parsed.buyerAddress;
      if (Object.keys(buyerPatch).length > 0) {
        await supa
          .from("orders")
          .update(buyerPatch)
          .eq("transaction", parsed.transaction)
          .eq("project_id", projectId);
      }

      if (parsed.visitorId && contactHash) {
        await supa
          .from("visitors")
          .update({ contact_hash: contactHash })
          .eq("visitor_id", parsed.visitorId)
          .eq("project_id", projectId)
          .is("contact_hash", null);
      }

      // Auto-registra o produto no registry DO PROJETO (self-healing). Só insere
      // se novo — ignoreDuplicates preserva included/role/name já configurados.
      if (parsed.productId) {
        await supa.from("products").upsert(
          { project_id: projectId, product_id: parsed.productId, name: parsed.productName },
          { onConflict: "project_id,product_id", ignoreDuplicates: true },
        );
      }
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      console.error("[webhook] enriquecimento falhou (venda ok)", { code, transaction: txn });
    }

    return NextResponse.json({ ok: true, result: data }, { status: 200 });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    console.error("[webhook] falha ao processar evento", { code, transaction: txn, eventId: evId });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
