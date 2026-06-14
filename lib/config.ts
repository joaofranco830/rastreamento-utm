/**
 * Configurações centrais do negócio.
 * Valores FIXADOS na arquitetura (v1) — não mudar sem alinhar no CLAUDE.md.
 */

/** Fuso do negócio. Todas as janelas/métricas usam este fuso na leitura. */
export const BUSINESS_TIMEZONE = "America/Sao_Paulo";

/** Janela de atribuição (last-click), em dias. */
export const ATTRIBUTION_WINDOW_DAYS = 7;

/** Modelo de atribuição da v1. */
export const ATTRIBUTION_MODEL = "last_click_7d";

/**
 * Restrições do visitor_id (REGRA DE OURO).
 * Curto, minúsculo e URL-safe (<= 30 chars) porque a Hotmart limita src/sck
 * a ~30 caracteres e recomenda minúsculas. Nada de UUID padrão (36 chars).
 */
export const VISITOR_ID_MAX_LENGTH = 30;
export const VISITOR_ID_REGEX = /^[a-z0-9_-]{1,30}$/;

/** Valida um visitor_id contra a regra de ouro. */
export function isValidVisitorId(id: string): boolean {
  return VISITOR_ID_REGEX.test(id);
}
