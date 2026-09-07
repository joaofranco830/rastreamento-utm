import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { getProducts, getTrackingConfig } from "@/lib/config-store";
import { getPerpetuoFunnel } from "@/lib/funnel";
import { createClient } from "@/lib/supabase/server";
import ProductsManager from "@/app/configuracoes/products-manager";
import CampaignTagsForm from "@/app/configuracoes/campaign-tags-form";
import AccountsFilter from "./accounts-filter";

export const dynamic = "force-dynamic";

export default async function ConfigurarFunilPage() {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) return null;

  const supabase = await createClient();
  const [products, config, funnel, { data: accounts }] = await Promise.all([
    getProducts(projectId),
    getTrackingConfig(projectId),
    getPerpetuoFunnel(projectId),
    supabase.from("ad_accounts").select("meta_account_id").eq("project_id", projectId).order("meta_account_id"),
  ]);

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h2 className="mb-1 text-base font-medium">Configurar funil</h2>
        <p className="text-sm text-zinc-500">O que este funil considera: produtos, tag de campanha e contas de anúncio.</p>
      </div>

      {/* Contas de anúncio deste funil */}
      <section>
        <h3 className="mb-1 text-sm font-medium">Contas de anúncio no dashboard</h3>
        <p className="mb-4 text-sm text-zinc-500">
          Escolha quais contas (já conectadas no projeto) entram no investido/ROAS deste funil.
        </p>
        <AccountsFilter
          accounts={(accounts ?? []) as { meta_account_id: string }[]}
          selected={funnel?.source_filters?.ad_accounts ?? []}
        />
      </section>

      {/* Produtos no dashboard */}
      <section>
        <h3 className="mb-1 text-sm font-medium">Produtos no dashboard</h3>
        <p className="mb-4 text-sm text-zinc-500">
          Marque os produtos que quer considerar e defina o papel de cada um. As mudanças salvam sozinhas.
        </p>
        <ProductsManager products={products} />
      </section>

      {/* Tag de campanha */}
      <section>
        <h3 className="mb-1 text-sm font-medium">Tag de campanha (filtro do investido)</h3>
        <p className="mb-4 text-sm text-zinc-500">Define quais campanhas do Meta entram no &quot;investido&quot; / ROAS.</p>
        <CampaignTagsForm initialTags={config.campaign_name_tags} />
      </section>
    </div>
  );
}
