-- =============================================================================
-- 0050_per_project_isolation.sql — isolamento COMPLETO das entidades do Meta
-- por projeto + nome da conta de anúncio.
--
-- Problema: ad_accounts.meta_account_id e {campaigns,adsets,ads}.meta_id tinham
-- UNIQUE GLOBAL — uma entidade do Meta só podia pertencer a UM projeto. Se dois
-- projetos usassem a mesma conta/campanha, colidiam (o project_id era
-- sobrescrito no upsert). Trocamos por UNIQUE composto (project_id, meta_*),
-- que isola por projeto. As FKs usam o id (PK), não o meta_id, então não são
-- afetadas. Não há duplicatas hoje (o UNIQUE global garantia isso), então a
-- troca é segura e não reescreve dado.
--
-- Também adiciona ad_accounts.name (para exibir o NOME da conta, não só o id).
-- =============================================================================

-- Nome da conta de anúncio (preenchido no sync via /me/adaccounts).
alter table ad_accounts add column if not exists name text;

-- ad_accounts: UNIQUE global → composto por projeto.
alter table ad_accounts drop constraint if exists ad_accounts_meta_account_id_key;
alter table ad_accounts
  add constraint ad_accounts_project_meta_account_key unique (project_id, meta_account_id);

-- campaigns / adsets / ads: UNIQUE(meta_id) global → composto por projeto.
alter table campaigns drop constraint if exists campaigns_meta_id_key;
alter table campaigns
  add constraint campaigns_project_meta_id_key unique (project_id, meta_id);

alter table adsets drop constraint if exists adsets_meta_id_key;
alter table adsets
  add constraint adsets_project_meta_id_key unique (project_id, meta_id);

alter table ads drop constraint if exists ads_meta_id_key;
alter table ads
  add constraint ads_project_meta_id_key unique (project_id, meta_id);
