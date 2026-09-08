"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveFunnelConfigAction } from "../funnel-actions";

interface Product { product_id: string; name: string | null; role: string; included: boolean }
interface Account { id: number; meta_account_id: string }
interface SF {
  campaign?: { mode: string; tags: string[] };
  product?: { mode: string; product_ids: string[]; offer?: string | null };
  recurrence?: "all" | "first";
  ad_account?: string | null;
}

const label = "mb-1 block text-sm font-medium";
const radio = "flex items-center gap-2 text-sm";

export default function ConfigForm({ products, accounts, sf }: { products: Product[]; accounts: Account[]; sf: SF | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const includedNow = products.filter((p) => p.included).map((p) => p.product_id);
  const [campaignMode, setCampaignMode] = useState<"all" | "contains">(sf?.campaign?.mode === "contains" || sf?.campaign?.tags?.length ? "contains" : "all");
  const [tags, setTags] = useState((sf?.campaign?.tags ?? []).join(", "));
  const [productMode, setProductMode] = useState<"all" | "included">(sf?.product?.mode === "included" || (!sf?.product && includedNow.length > 0) ? "included" : "all");
  const [included, setIncluded] = useState<Set<string>>(new Set(sf?.product?.product_ids?.length ? sf.product.product_ids : includedNow));
  const [offer, setOffer] = useState<string>(sf?.product?.offer ?? "");
  const [recurrence, setRecurrence] = useState<"all" | "first">(sf?.recurrence ?? "all");
  const [account, setAccount] = useState<string>(sf?.ad_account ?? accounts[0]?.meta_account_id ?? "");

  const toggle = (id: string) =>
    setIncluded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveFunnelConfigAction({
        campaignMode,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        productMode,
        includedProductIds: [...included],
        offerProductId: offer || null,
        recurrence,
        adAccount: account || null,
      });
      setMsg(r.ok ? "Salvo ✓ (os dashboards já refletem)" : r.error ?? "Falha.");
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-7">
      {/* Conta de anúncio */}
      <div>
        <span className={label}>Conta de anúncio</span>
        <select value={account} onChange={(e) => setAccount(e.target.value)} className="w-full rounded-lg border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]">
          {accounts.length === 0 && <option value="">— nenhuma conta sincronizada —</option>}
          {accounts.map((a) => (
            <option key={a.id} value={a.meta_account_id}>act_{a.meta_account_id}</option>
          ))}
        </select>
      </div>

      {/* Campanhas */}
      <div>
        <span className={label}>Campanhas a considerar</span>
        <div className="flex flex-col gap-2">
          <label className={radio}><input type="radio" checked={campaignMode === "all"} onChange={() => setCampaignMode("all")} /> Todas as campanhas</label>
          <label className={radio}><input type="radio" checked={campaignMode === "contains"} onChange={() => setCampaignMode("contains")} /> Só as que contêm a tag…</label>
          {campaignMode === "contains" && (
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ex.: [GEO-VOZ-02], PERP" className="rounded-lg border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]" />
          )}
        </div>
      </div>

      {/* Produtos */}
      <div>
        <span className={label}>Produtos a considerar</span>
        <div className="mb-2 flex flex-col gap-2">
          <label className={radio}><input type="radio" checked={productMode === "all"} onChange={() => setProductMode("all")} /> Todos os produtos</label>
          <label className={radio}><input type="radio" checked={productMode === "included"} onChange={() => setProductMode("included")} /> Só os selecionados</label>
        </div>
        {productMode === "included" && (
          <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-black/[.1] p-2 dark:border-white/[.14]">
            {products.map((p) => (
              <label key={p.product_id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-black/[.03] dark:hover:bg-white/[.04]">
                <input type="checkbox" checked={included.has(p.product_id)} onChange={() => toggle(p.product_id)} />
                <span className="truncate">{p.name ?? p.product_id}</span>
                <span className="ml-auto text-xs text-zinc-400">{p.role}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Oferta específica */}
      <div>
        <span className={label}>Oferta específica</span>
        <select value={offer} onChange={(e) => setOffer(e.target.value)} className="w-full rounded-lg border border-black/[.12] bg-transparent px-3 py-2 text-sm dark:border-white/[.18]">
          <option value="">Todas as ofertas</option>
          {products.map((p) => (
            <option key={p.product_id} value={p.product_id}>{p.name ?? p.product_id}</option>
          ))}
        </select>
      </div>

      {/* Recorrência */}
      <div>
        <span className={label}>Recorrência (produtos de assinatura)</span>
        <div className="flex flex-col gap-2">
          <label className={radio}><input type="radio" checked={recurrence === "all"} onChange={() => setRecurrence("all")} /> Considerar 1ª compra + recorrências</label>
          <label className={radio}><input type="radio" checked={recurrence === "first"} onChange={() => setRecurrence("first")} /> Só a 1ª compra</label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={pending} className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50">
          Salvar configuração
        </button>
        {msg && <span className="text-sm text-zinc-400">{msg}</span>}
      </div>
      <p className="text-xs text-zinc-400">
        Conta/campanha/produtos já afetam os números agora. Oferta específica e recorrência ficam <strong>salvas</strong> e
        entram no cálculo numa próxima leva (refino do Perpétuo).
      </p>
    </div>
  );
}
