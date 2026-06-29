-- =============================================================================
-- 0024_backfill_project_id.sql — Fase V3-1 (parte 2: backfill)
-- Fonte de verdade: arquitetura-rastreamento-utm-v3.md (§5.3 e §15 Fase V3-1).
--
-- O ITEM DE MAIOR RISCO. Carimba TODO o dado atual para o Projeto Padrão (id=1).
-- `project_id` é a ÚNICA coluna escrita — nenhum gross/net/refunded/transaction/
-- order_date/qualquer valor real é tocado. Só atualiza linhas onde ainda é NULL
-- (idempotente). O NOT NULL/DEFAULT vem em 0024b, depois do gate de contagem.
--
-- Pré-requisito: 0023 (colunas) aplicada e Projeto Padrão "Geografia da Voz"
-- existente (id=1, criado em 0022).
-- =============================================================================

-- (1) Carimbar todas as tabelas de dados com o Projeto Padrão.
update funnels             set project_id = 1 where project_id is null;
update ad_accounts         set project_id = 1 where project_id is null;
update campaigns           set project_id = 1 where project_id is null;
update adsets              set project_id = 1 where project_id is null;
update ads                 set project_id = 1 where project_id is null;
update visitors            set project_id = 1 where project_id is null;
update touchpoints         set project_id = 1 where project_id is null;
update tracking_events     set project_id = 1 where project_id is null;
update orders              set project_id = 1 where project_id is null;
update order_events        set project_id = 1 where project_id is null;
update attributions        set project_id = 1 where project_id is null;
update meta_insights_daily set project_id = 1 where project_id is null;
update products            set project_id = 1 where project_id is null;
update tracking_config     set project_id = 1 where project_id is null;

-- (2) Migrar a "lente" global de hoje para a config do funil Perpétuo do Padrão.
--     A config segue ESPELHADA em tracking_config/products (que os dashboards v2
--     ainda leem) — aqui só PREPARAMOS o source_filters do funil (usado a partir
--     da V3-3). campaign_name_tags + produtos incluídos viram os filtros de fonte.
insert into funnels (name, project_id, type, source_filters, domain)
select
  'Perpétuo — Geografia da Voz',
  1,
  'perpetuo',
  jsonb_build_object(
    'campaign', jsonb_build_object(
      'mode', 'contains',
      'tags', to_jsonb((select coalesce(campaign_name_tags, '{}') from tracking_config where id = 1))
    ),
    'product', jsonb_build_object(
      'mode', 'included',
      'product_ids', to_jsonb((select coalesce(array_agg(product_id), '{}'::text[]) from products where included))
    ),
    'recurrence', 'all'
  ),
  null
where not exists (select 1 from funnels where project_id = 1 and type = 'perpetuo');
