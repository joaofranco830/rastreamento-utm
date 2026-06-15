/** Formatadores para o dashboard (pt-BR). */
export const brl = (n: unknown): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

export const inteiro = (n: unknown): string =>
  new Intl.NumberFormat("pt-BR").format(Number(n) || 0);

/** Percentual a partir de uma fração (0.32 -> "32,0%"). null -> "—". */
export const pct = (n: unknown): string =>
  n == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(n));

/** Multiplicador de ROAS (3.2 -> "3,20×"). null -> "—". */
export const mult = (n: unknown): string =>
  n == null ? "—" : `${(Number(n)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
