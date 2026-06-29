import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Guarda anti-SSRF para o verificador de pixel (§14 / ADR-v3-13). Faz fetch
 * server-side de uma URL ARBITRÁRIA informada pelo usuário — então: só http(s),
 * bloqueia hosts internos / IPs privados / metadata (169.254.169.254), não segue
 * redirect, com timeout e limite de bytes.
 */

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === "::1" || low === "::") return true;
    if (low.startsWith("::ffff:")) return isPrivateIp(low.replace("::ffff:", "")); // IPv4-mapped
    if (low.startsWith("fc") || low.startsWith("fd")) return true; // ULA
    if (low.startsWith("fe80")) return true; // link-local
    return false;
  }
  return true; // não reconhecido -> bloqueia
}

export interface SafeFetchResult {
  ok: boolean;
  html?: string;
  reason?: string;
}

export async function safeFetchHtml(rawUrl: string): Promise<SafeFetchResult> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "URL inválida." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "Só http(s) é permitido." };
  }
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "Host interno bloqueado." };
  }
  // Se já for um IP literal, checa direto; senão resolve DNS e checa todos.
  if (net.isIP(host)) {
    if (isPrivateIp(host)) return { ok: false, reason: "Endereço interno bloqueado." };
  } else {
    let addrs;
    try {
      addrs = await lookup(host, { all: true });
    } catch {
      return { ok: false, reason: "DNS não resolveu o host." };
    }
    if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
      return { ok: false, reason: "Endereço interno bloqueado." };
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(u.toString(), {
      signal: controller.signal,
      redirect: "manual", // não segue redirect (evita SSRF via 30x para interno)
      headers: { "user-agent": "FrancoAds-PixelCheck/1.0" },
    });
    if (res.status >= 300 && res.status < 400) {
      return { ok: false, reason: "A página redireciona; não seguimos redirect por segurança." };
    }
    const reader = res.body?.getReader();
    if (!reader) return { ok: true, html: await res.text() };
    const dec = new TextDecoder();
    let html = "";
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += dec.decode(value, { stream: true });
      if (bytes > 1_000_000) break; // teto de 1 MB
    }
    return { ok: true, html };
  } catch (e) {
    return { ok: false, reason: (e as Error).name === "AbortError" ? "Timeout ao buscar a página." : "Falha ao buscar a página." };
  } finally {
    clearTimeout(timer);
  }
}
