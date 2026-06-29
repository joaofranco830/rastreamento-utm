import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { getProducts, getTrackingConfig } from "@/lib/config-store";
import Shell from "../shell";
import ProductsManager from "./products-manager";
import CampaignTagsForm from "./campaign-tags-form";
import RetentionForm from "./retention-form";
import CopyField from "./copy-field";

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

export default async function ConfiguracoesPage() {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/login");

  const supabase = await createClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ data: pixel }, { data: endpoint }, evt, products, config] = await Promise.all([
    supabase.from("project_pixels").select("pixel_key").eq("project_id", projectId).eq("active", true).maybeSingle(),
    supabase
      .from("project_endpoints")
      .select("endpoint_key")
      .eq("project_id", projectId)
      .eq("provider", "hotmart")
      .eq("active", true)
      .maybeSingle(),
    supabase
      .from("tracking_events")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .gte("ts", since),
    getProducts(),
    getTrackingConfig(),
  ]);

  const h = await headers();
  const host = h.get("host") ?? "rastreamento-utm.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const pixelKey = pixel?.pixel_key ?? null;
  const endpointKey = endpoint?.endpoint_key ?? null;
  const recebendo = (evt.count ?? 0) > 0;

  const snippet = pixelKey
    ? `<script src="${origin}/p/${pixelKey}/t.js" async></script>`
    : null;
  const webhookUrl = endpointKey ? `${origin}/api/webhook/hotmart/${endpointKey}` : null;

  return (
    <Shell active="/configuracoes">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Configurar</h1>
        <p className="mb-8 text-sm text-zinc-500">Pixel, integração Hotmart, produtos, tag e retenção do projeto.</p>

        {/* Pixel */}
        <section className="mb-10">
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

        {/* Integração Hotmart */}
        <section className="mb-10">
          <h2 className="mb-2 text-lg font-medium">Integração Hotmart (webhook)</h2>
          <p className="mb-3 text-sm text-zinc-500">
            URL única deste projeto para o Webhook 2.0 da Hotmart. Idempotente e validada por Hottok.
          </p>
          {webhookUrl ? <CopyField value={webhookUrl} /> : <p className="text-sm text-amber-600">Nenhum endpoint ativo.</p>}
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
            <li>Na Hotmart: <strong>Ferramentas → Webhook (API e Notificações)</strong> → criar.</li>
            <li>Cole a URL acima e selecione os eventos de <strong>compra/reembolso</strong>.</li>
            <li>Copie o <strong>Hottok</strong> gerado pela Hotmart e salve nas credenciais do projeto.</li>
            <li>Envie um evento de teste — o status do projeto passa a registrar a venda.</li>
          </ol>
          <p className="mt-3 text-xs text-zinc-400">
            O Projeto Padrão já opera com a integração existente; reapontar para esta URL é opcional.
          </p>
        </section>

        {/* Em produção: itens do hub ainda não construídos */}
        <section className="mb-10 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link href="/em-producao?t=Importar+CSV" className="rounded-xl border border-dashed border-black/[.12] p-3 text-sm text-zinc-500 transition-colors hover:bg-black/[.03] dark:border-white/[.16] dark:hover:bg-white/[.04]">
            🚧 Importar CSV (vendas Hotmart)
          </Link>
          <Link href="/em-producao?t=Construtor+de+UTMs" className="rounded-xl border border-dashed border-black/[.12] p-3 text-sm text-zinc-500 transition-colors hover:bg-black/[.03] dark:border-white/[.16] dark:hover:bg-white/[.04]">
            🚧 Construtor de UTMs + verificador
          </Link>
          <Link href="/em-producao?t=Integração+Meta+(token)" className="rounded-xl border border-dashed border-black/[.12] p-3 text-sm text-zinc-500 transition-colors hover:bg-black/[.03] dark:border-white/[.16] dark:hover:bg-white/[.04]">
            🚧 Integração Meta (token por projeto)
          </Link>
          <Link href="/em-producao?t=Membros+do+projeto" className="rounded-xl border border-dashed border-black/[.12] p-3 text-sm text-zinc-500 transition-colors hover:bg-black/[.03] dark:border-white/[.16] dark:hover:bg-white/[.04]">
            🚧 Membros do projeto
          </Link>
        </section>

        {/* Produtos */}
        <section className="mb-10">
          <h2 className="mb-1 text-lg font-medium">Produtos no dashboard</h2>
          <p className="mb-4 text-sm text-zinc-500">
            Marque os produtos que quer considerar e defina o papel de cada um. As mudanças salvam sozinhas.
          </p>
          <ProductsManager products={products} />
        </section>

        {/* Tag de campanha */}
        <section className="mb-10">
          <h2 className="mb-1 text-lg font-medium">Tag de campanha (filtro do investido)</h2>
          <p className="mb-4 text-sm text-zinc-500">Define quais campanhas do Meta entram no &quot;investido&quot; / ROAS.</p>
          <CampaignTagsForm initialTags={config.campaign_name_tags} />
        </section>

        {/* Retenção */}
        <section className="mb-6">
          <h2 className="mb-1 text-lg font-medium">Retenção de eventos brutos</h2>
          <RetentionForm initialDays={config.retention_days} />
        </section>

        <section className="mt-10 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
          <Link href="/v1" className="text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300">
            Abrir dashboard antigo (v1) — visão da conta inteira, sem filtros
          </Link>
        </section>
      </div>
    </Shell>
  );
}
