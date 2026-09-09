/**
 * Tipos e helpers para CASAR os dados de VSL (VTurb) com as linhas das telas
 * Campanhas/Criativos. Client+server safe (sem "server-only").
 *
 * O VTurb guarda o valor cru da UTM, às vezes URL-encoded (espaço vira '+').
 * Já o Meta guarda o nome com espaços reais. Normalizamos os dois lados do mesmo
 * jeito ('+'→espaço, colapsa espaços, minúsculo, trim) — a mesma ideia do
 * lower(trim(...)) usado no RPC campaigns_table — para o join bater.
 */

export interface VslJoin {
  viewed: number;
  plays: number;
  clicked: number;
  over_pitch: number;
  conversions: number;
  amount_brl: number;
  /** Soma de (engagement_fraction × views) — para média ponderada por views. */
  eng_weight: number;
}

export interface VslJoinMaps {
  /** Chave = nome normalizado da campanha (utm_campaign). */
  byCampaign: Record<string, VslJoin>;
  /** Chave = nome normalizado do criativo (utm_content). */
  byContent: Record<string, VslJoin>;
}

export const EMPTY_VSL_JOIN: VslJoin = {
  viewed: 0, plays: 0, clicked: 0, over_pitch: 0, conversions: 0, amount_brl: 0, eng_weight: 0,
};

/** Normaliza um valor de UTM/nome para o casamento (case/encoding-insensível). */
export function normUtmKey(s: string | null | undefined): string {
  return (s ?? "").replace(/\+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Campos vsl_* prontos para espalhar (spread) numa linha de métricas. */
export function vslFields(name: string | null | undefined, map: Record<string, VslJoin> | null | undefined) {
  const j = (map && map[normUtmKey(name)]) || EMPTY_VSL_JOIN;
  return {
    vsl_viewed: j.viewed,
    vsl_plays: j.plays,
    vsl_clicked: j.clicked,
    vsl_over_pitch: j.over_pitch,
    vsl_conversions: j.conversions,
    vsl_amount_brl: j.amount_brl,
    vsl_eng_weight: j.eng_weight,
  };
}
