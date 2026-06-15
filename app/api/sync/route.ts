export const runtime = "nodejs"; // service_role + token Meta -> não edge
export const dynamic = "force-dynamic";
export const maxDuration = 60; // sync pode levar alguns segundos

import { NextResponse } from "next/server";
import { runMetaSync } from "@/lib/meta/sync";

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
    const result = await runMetaSync();
    const status = result.ok || result.skipped ? 200 : 500;
    return NextResponse.json(result, { status });
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
