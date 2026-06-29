-- =============================================================================
-- 0024b_project_id_not_null.sql — Fase V3-1 (parte 3: travar o tenant)
-- Fonte de verdade: arquitetura-rastreamento-utm-v3.md (§5.2/§5.3 e §15 Fase V3-1).
--
-- Só aplicar APÓS o gate de contagem do 0024 (count(project_id IS NULL)=0 em
-- todas as 14 tabelas e totais idênticos ao baseline). Faz duas coisas:
--   * SET DEFAULT 1  -> enquanto o app antigo (pré V3-2) não carimba project_id,
--     toda inserção nova (collect/webhook/sync) cai automaticamente no Projeto
--     Padrão. Mantém o funil AO VIVO funcionando sem mudança.
--   * SET NOT NULL   -> impossível, daqui pra frente, gravar linha sem tenant.
-- Se alguma linha ainda fosse NULL, o SET NOT NULL falha e a transação inteira
-- reverte (falha segura — nada é commitado).
-- =============================================================================

alter table funnels             alter column project_id set default 1, alter column project_id set not null;
alter table ad_accounts         alter column project_id set default 1, alter column project_id set not null;
alter table campaigns           alter column project_id set default 1, alter column project_id set not null;
alter table adsets              alter column project_id set default 1, alter column project_id set not null;
alter table ads                 alter column project_id set default 1, alter column project_id set not null;
alter table visitors            alter column project_id set default 1, alter column project_id set not null;
alter table touchpoints         alter column project_id set default 1, alter column project_id set not null;
alter table tracking_events     alter column project_id set default 1, alter column project_id set not null;
alter table orders              alter column project_id set default 1, alter column project_id set not null;
alter table order_events        alter column project_id set default 1, alter column project_id set not null;
alter table attributions        alter column project_id set default 1, alter column project_id set not null;
alter table meta_insights_daily alter column project_id set default 1, alter column project_id set not null;
alter table products            alter column project_id set default 1, alter column project_id set not null;
alter table tracking_config     alter column project_id set default 1, alter column project_id set not null;
