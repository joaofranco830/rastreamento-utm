import "server-only";
import { createHash } from "node:crypto";

/**
 * Hash de contato (sha256) para matching de atribuição por fallback (Fase 3).
 * Guardamos SÓ o hash em orders.contact_hash — nunca e-mail/telefone crus
 * (esses ficam apenas no raw_payload, server-side, protegido por RLS).
 * Precedência: e-mail (identificador primário) -> telefone.
 */
function normalizeEmail(email: string | null): string | null {
  return email ? email.trim().toLowerCase() || null : null;
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

export function hashContact(
  email: string | null,
  phone: string | null,
): string | null {
  const norm = normalizeEmail(email) ?? normalizePhone(phone);
  if (!norm) return null;
  return createHash("sha256").update(norm).digest("hex");
}
