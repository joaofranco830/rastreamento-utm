export const runtime = "nodejs"; // service_role + token Meta -> não edge
export const dynamic = "force-dynamic";
export const maxDuration = 60; // sync pode levar alguns segundos
export const preferredRegion = "gru1"; // perto do Supabase (sa-east-1)

import { NextResponse } from "next/server";
import { runMetaSyncAll } from "@/lib/meta/sync";

/**
 * Dispara o sync do Meta. Protegido por SYNC_SECRET (cron e disparo manual).
 * O cron (Supabase/Vercel) envia `Authorization: Bearer <SYNC_SECRET>`.
 * (Na Fase 5, o botão "atualizar" do dashboard chamará por sessão autenticada.)
 */
function authorized(req: Request): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return false; // fail-closed: sem segredo configurado, nega
  const auth = req.headers.get("authorization");
  const x = req.headers.get("x-sync-secret");
  return auth === `Bearer ${secret}` || x === secret;
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const results = await runMetaSyncAll();
    // 200 se todos passaram ou foram pulados; 500 se algum falhou de verdade.
    const anyHardFail = results.some((r) => !r.ok && !r.skipped);
    return NextResponse.json({ ok: !anyHardFail, results }, { status: anyHardFail ? 500 : 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync] erro inesperado:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}
export async function GET(req: Request): Promise<Response> {
  return handle(req);
}
