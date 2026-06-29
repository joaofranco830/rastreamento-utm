/**
 * Construtor de UTMs (ADR-v3-13). Gera links rastreados a partir da URL de
 * vendas: defaults pago (Meta) e orgânicos prontos; o usuário adiciona variações.
 * Esquema canônico do pago: utm_content={{ad.id}} / utm_term={{adset.id}} (os
 * placeholders {{...}} são substituídos pela Meta na veiculação).
 */

export type LinkKind = "paid" | "organic";

export interface UtmLink {
  label: string;
  kind: LinkKind;
  params: Record<string, string>;
  full_url: string;
}

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export function buildUrl(base: string, params: Record<string, string>): string {
  try {
    const u = new URL(base);
    for (const [k, v] of Object.entries(params)) {
      if (v) u.searchParams.set(k, v);
    }
    return u.toString();
  } catch {
    return base;
  }
}

export function defaultLinks(base: string): UtmLink[] {
  const presets: { label: string; kind: LinkKind; params: Record<string, string> }[] = [
    {
      label: "Meta — Tráfego pago",
      kind: "paid",
      params: {
        utm_source: "meta",
        utm_medium: "paid_social",
        utm_campaign: "{{campaign.name}}",
        utm_content: "{{ad.id}}",
        utm_term: "{{adset.id}}",
      },
    },
    { label: "Orgânico — Bio do Instagram", kind: "organic", params: { utm_source: "instagram", utm_medium: "organic", utm_campaign: "bio" } },
    { label: "Orgânico — Stories/Perfil", kind: "organic", params: { utm_source: "instagram", utm_medium: "organic", utm_campaign: "perfil" } },
    { label: "Orgânico — WhatsApp/Direto", kind: "organic", params: { utm_source: "whatsapp", utm_medium: "organic", utm_campaign: "direto" } },
  ];
  return presets.map((p) => ({ ...p, full_url: buildUrl(base, p.params) }));
}
