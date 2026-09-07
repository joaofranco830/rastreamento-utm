import { requireUser } from "@/lib/auth";
import { getActiveProjectId } from "@/lib/tenant";
import { getProducts, getTrackingConfig } from "@/lib/config-store";
import ProductsManager from "@/app/configuracoes/products-manager";
import CampaignTagsForm from "@/app/configuracoes/campaign-tags-form";

export const dynamic = "force-dynamic";

export default async function ConfigurarFunilPage() {
  await requireUser();
  const projectId = await getActiveProjectId();
  if (!projectId) return null;

  const [products, config] = await Promise.all([getProducts(projectId), getTrackingConfig(projectId)]);

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h2 className="mb-1 text-base font-medium">Configurar funil</h2>
        <p className="text-sm text-zinc-500">O que este funil considera: produtos e tag de campanha.</p>
      </div>

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
