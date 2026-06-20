-- =============================================================================
-- 0017_meta_video_status.sql — Fase V2-2 (sync do Meta ampliado)
-- Fonte de verdade: arquitetura-rastreamento-utm-v2.md (ADR-v2-8, §5, §11 V2-2).
--
-- ADITIVA: métricas de vídeo em meta_insights_daily + effective_status na
-- hierarquia. `link_clicks` já existe desde a 0001. Não altera dado existente
-- (defaults 0 / NULL). Sem funções novas.
-- =============================================================================

-- Métricas de vídeo (vazias em anúncio estático; preenchidas em vídeo).
alter table meta_insights_daily
  add column if not exists video_3s    bigint not null default 0,  -- views de 3s
  add column if not exists video_p75   bigint not null default 0,  -- reproduções 75%
  add column if not exists video_p95   bigint not null default 0,  -- reproduções 95%
  add column if not exists video_plays bigint not null default 0;  -- reproduções (plays)

-- Veiculação/status por nível (ACTIVE/PAUSED/ARCHIVED/...). NULL = desconhecido.
alter table campaigns add column if not exists effective_status text;
alter table adsets    add column if not exists effective_status text;
alter table ads       add column if not exists effective_status text;
