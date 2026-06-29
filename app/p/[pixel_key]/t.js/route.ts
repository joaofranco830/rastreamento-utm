export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "gru1";

/**
 * GET /p/{pixel_key}/t.js — pixel POR PROJETO (ADR-v3-9).
 * Serve um shim minúsculo que (1) embute a pixel_key do projeto em
 * window.__faPixelKey e (2) carrega o tracker estático /t.js (fonte única, sem
 * divergência). Robusto contra construtores de página que removem data-*: a
 * chave vai EMBUTIDA no JS servido, não num atributo. O /t.js "pelado" continua
 * válido (sem chave -> Projeto Padrão).
 */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ pixel_key: string }> },
): Promise<Response> {
  const { pixel_key } = await params;
  // Sanitiza: só aceita o formato dos nossos tokens (hex/uuid sem hífen).
  const key = /^[a-z0-9]{1,64}$/i.test(pixel_key) ? pixel_key : "";
  const origin = new URL(req.url).origin;

  const js =
    "(function(){window.__faPixelKey=" +
    JSON.stringify(key) +
    ";var s=document.createElement('script');s.src=" +
    JSON.stringify(origin + "/t.js") +
    ";s.async=true;(document.head||document.documentElement).appendChild(s);})();";

  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
