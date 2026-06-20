import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProducts, getTrackingConfig } from "@/lib/config-store";
import LogoutButton from "../logout-button";
import ProductsManager from "./products-manager";
import CampaignTagsForm from "./campaign-tags-form";
import RetentionForm from "./retention-form";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [products, config] = await Promise.all([getProducts(), getTrackingConfig()]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
          <p className="text-sm text-zinc-500">Produtos, tag de campanha e retenção</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/central"
            className="rounded-lg border border-black/[.12] px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.2] dark:hover:bg-white/[.06]"
          >
            ← Voltar
          </Link>
          <LogoutButton />
        </div>
      </header>

      {/* Produtos */}
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-medium">Produtos no dashboard</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Marque os produtos que quer considerar e defina o papel de cada um. O papel alimenta o
          bloco &quot;faturamento por papel&quot;. As mudanças salvam sozinhas.
        </p>
        <ProductsManager products={products} />
      </section>

      {/* Tag de campanha */}
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-medium">Tag de campanha (filtro do investido)</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Define quais campanhas do Meta entram no &quot;investido&quot; / ROAS.
        </p>
        <CampaignTagsForm initialTags={config.campaign_name_tags} />
      </section>

      {/* Retenção */}
      <section className="mb-6">
        <h2 className="mb-1 text-lg font-medium">Retenção de eventos brutos</h2>
        <RetentionForm initialDays={config.retention_days} />
      </section>

      {/* Acesso discreto ao dashboard antigo (v1) */}
      <section className="mt-10 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
        <Link
          href="/v1"
          className="text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Abrir dashboard antigo (v1) — visão da conta inteira, sem filtros
        </Link>
      </section>
    </main>
  );
}
