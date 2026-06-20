/** Rótulos de classe de origem (compartilhado entre server e client). */
export const CLASS_LABEL: Record<string, string> = {
  paid_meta: "Meta (pago)",
  paid_meta_fbclid: "Meta (fbclid)",
  organic: "Orgânico",
  referral: "Referral",
  direct: "Direto",
  other_utm: "Outra UTM",
  "(sem atribuição)": "Não rastreada",
};

export function classLabel(c: string | null | undefined): string {
  if (!c) return "—";
  return CLASS_LABEL[c] ?? c;
}
