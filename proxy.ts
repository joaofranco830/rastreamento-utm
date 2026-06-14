import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: a convenção "middleware" virou "proxy" (mesma ideia: roda antes
// das rotas). Aqui renovamos a sessão do Supabase e protegemos as rotas.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Roda em todas as rotas, menos:
     * - /api/* (rotas públicas/autossuficientes: collect, webhook, sync) — não
     *   faz sentido checar sessão de usuário no endpoint de ingestão mais quente.
     * - arquivos estáticos do Next (_next/static, _next/image)
     * - favicon e imagens
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|css|html|txt|ico|woff|woff2|ttf|map|json|webmanifest)$).*)",
  ],
};
