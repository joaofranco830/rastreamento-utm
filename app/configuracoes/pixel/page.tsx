import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import CopyField from "../copy-field";

export const dynamic = "force-dynamic";

function StatusBadge({ on, labelOn, labelOff }: { on: boolean; labelOn: string; labelOff: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        on
          ? "bg-emerald-400/15 text-emerald-700 dark:text-emerald-300"
          : "bg-amber-400/15 text-amber-700 dark:text-amber-300"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-500" : "bg-amber-500"}`} />
      {on ? labelOn : labelOff}
    </span>
  );
}

export default async function PixelTab() {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/login");

  const supabase = await createClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ data: pixel }, evt] = await Promise.all([
    supabase.from("project_pixels").select("pixel_key").eq("project_id", projectId).eq("active", true).maybeSingle(),
    supabase
      .from("tracking_events")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .gte("ts", since),
  ]);

  const h = await headers();
  const host = h.get("host") ?? "rastreamento-utm.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const pixelKey = pixel?.pixel_key ?? null;
  const recebendo = (evt.count ?? 0) > 0;
  const snippet = pixelKey ? `<script src="${origin}/p/${pixelKey}/t.js" async></script>` : null;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Pixel do projeto</h2>
        <StatusBadge on={recebendo} labelOn="Recebendo eventos" labelOff="Sem sinal (24h)" />
      </div>
      <p className="mb-3 text-sm text-zinc-500">
        Cole este script em <strong>todas</strong> as páginas do funil (antes do <code>&lt;/body&gt;</code>). A chave do
        projeto já vem embutida — funciona mesmo se o construtor de página remover atributos.
      </p>
      {snippet ? (
        <CopyField value={snippet} />
      ) : (
        <p className="text-sm text-amber-600">Nenhum pixel ativo para este projeto.</p>
      )}
    </section>
  );
}
