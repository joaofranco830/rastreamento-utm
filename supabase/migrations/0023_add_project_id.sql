-- =============================================================================
-- 0023_add_project_id.sql — Fase V3-1 (parte 1: colunas)
-- Fonte de verdade: arquitetura-rastreamento-utm-v3.md (§5.2 e §15 Fase V3-1).
--
-- ADITIVA e NÃO-DESTRUTIVA: adiciona `project_id` (NULLABLE) + índice em cada
-- uma das 14 tabelas de dados, e as colunas `type`/`source_filters` em `funnels`
-- (config do funil — ADR-v3-10). Nenhum valor existente é alterado: só nasce
-- coluna nova vazia. O backfill (0024) e o NOT NULL/DEFAULT (0024b) vêm depois.
-- =============================================================================

-- funnels ganha também a config de funil (type + filtros de fonte).
alter table funnels add column if not exists project_id     bigint references projects (id);
alter table funnels add column if not exists type           text;
alter table funnels add column if not exists source_filters jsonb;

alter table ad_accounts         add column if not exists project_id bigint references projects (id);
alter table campaigns           add column if not exists project_id bigint references projects (id);
alter table adsets              add column if not exists project_id bigint references projects (id);
alter table ads                 add column if not exists project_id bigint references projects (id);
alter table visitors            add column if not exists project_id bigint references projects (id);
alter table touchpoints         add column if not exists project_id bigint references projects (id);
alter table tracking_events     add column if not exists project_id bigint references projects (id);
alter table orders              add column if not exists project_id bigint references projects (id);
alter table order_events        add column if not exists project_id bigint references projects (id);
alter table attributions        add column if not exists project_id bigint references projects (id);
alter table meta_insights_daily add column if not exists project_id bigint references projects (id);
alter table products            add column if not exists project_id bigint references projects (id);
alter table tracking_config     add column if not exists project_id bigint references projects (id);

-- Índices em project_id (joins/filtragem por tenant).
create index if not exists idx_funnels_project             on funnels (project_id);
create index if not exists idx_ad_accounts_project         on ad_accounts (project_id);
create index if not exists idx_campaigns_project           on campaigns (project_id);
create index if not exists idx_adsets_project              on adsets (project_id);
create index if not exists idx_ads_project                 on ads (project_id);
create index if not exists idx_visitors_project            on visitors (project_id);
create index if not exists idx_touchpoints_project         on touchpoints (project_id);
create index if not exists idx_tracking_events_project     on tracking_events (project_id);
create index if not exists idx_orders_project              on orders (project_id);
create index if not exists idx_order_events_project        on order_events (project_id);
create index if not exists idx_attributions_project        on attributions (project_id);
create index if not exists idx_meta_insights_daily_project on meta_insights_daily (project_id);
create index if not exists idx_products_project            on products (project_id);
create index if not exists idx_tracking_config_project     on tracking_config (project_id);
