import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { hasCredential } from "@/lib/credentials";
import CopyField from "../copy-field";
import { HottokForm } from "../credential-forms";

export const dynamic = "force-dynamic";

export default async function HotmartTab() {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/login");

  const supabase = await createClient();
  const [{ data: endpoint }, hottokSet] = await Promise.all([
    supabase
      .from("project_endpoints")
      .select("endpoint_key")
      .eq("project_id", projectId)
      .eq("provider", "hotmart")
      .eq("active", true)
      .maybeSingle(),
    hasCredential(projectId, "hotmart", "hottok"),
  ]);

  const h = await headers();
  const host = h.get("host") ?? "rastreamento-utm.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const endpointKey = endpoint?.endpoint_key ?? null;
  const webhookUrl = endpointKey ? `${origin}/api/webhook/hotmart/${endpointKey}` : null;

  return (
    <section>
      <h2 className="mb-2 text-lg font-medium">Integração Hotmart (webhook)</h2>
      <p className="mb-3 text-sm text-zinc-400">
        URL única deste projeto para o Webhook 2.0 da Hotmart. Idempotente e validada por Hottok.
      </p>
      {webhookUrl ? <CopyField value={webhookUrl} /> : <p className="text-sm text-amber-600">Nenhum endpoint ativo.</p>}
      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
        <li>Na Hotmart: <strong>Ferramentas → Webhook (API e Notificações)</strong> → criar.</li>
        <li>Cole a URL acima e selecione os eventos de <strong>compra/reembolso</strong>.</li>
        <li>Copie o <strong>Hottok</strong> gerado pela Hotmart e salve abaixo.</li>
        <li>Envie um evento de teste — o status do projeto passa a registrar a venda.</li>
      </ol>
      <HottokForm configured={hottokSet} />
    </section>
  );
}
