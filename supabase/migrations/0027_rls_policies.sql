-- =============================================================================
-- 0027_rls_policies.sql — Fase V3-3 (FLIP da RLS: isolamento por filiação)
-- Fonte de verdade: arquitetura-rastreamento-utm-v3.md (§6, ADR-v3-4/5/6).
--
-- Liga o isolamento NO BANCO. Para `authenticated` (sessão do usuário), cada
-- tabela só revela linhas de projetos onde o usuário é membro (ou tudo, se
-- owner). `service_role` (ingestão/sync/admin) BYPASSA RLS por design -> a
-- produção atual, que lê via service_role, NÃO é afetada por este flip; só
-- habilita o isolamento no caminho de sessão (validado no preview).
-- `project_credentials` fica SEM política para authenticated -> negado (o
-- segredo nunca chega ao browser). `anon` sem política em nada -> negado.
-- =============================================================================

-- ---- Helpers de autorização (fonte única). SECURITY DEFINER -> bypassam RLS
-- ---- nas tabelas que consultam (evita recursão de política). search_path fixo.
create or replace function app_is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users where id = auth.uid() and is_owner);
$$;

create or replace function app_can_access(p_project_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users u where u.id = auth.uid() and u.is_owner)
      or exists (select 1 from project_members m
                 where m.user_id = auth.uid() and m.project_id = p_project_id);
$$;

create or replace function app_role_in(p_project_id bigint)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from app_users u where u.id = auth.uid() and u.is_owner) then 'owner'
    else (select role from project_members where user_id = auth.uid() and project_id = p_project_id)
  end;
$$;

revoke all on function app_is_owner() from public, anon;
revoke all on function app_can_access(bigint) from public, anon;
revoke all on function app_role_in(bigint) from public, anon;
grant execute on function app_is_owner() to authenticated;
grant execute on function app_can_access(bigint) to authenticated;
grant execute on function app_role_in(bigint) to authenticated;

-- ---- Políticas de LEITURA por tenant nas tabelas de DADOS (14) -------------
do $$
declare t text;
begin
  foreach t in array array[
    'visitors','touchpoints','tracking_events','orders','order_events',
    'attributions','campaigns','adsets','ads','ad_accounts',
    'meta_insights_daily','funnels','products','tracking_config'
  ] loop
    execute format('drop policy if exists tenant_read on %I', t);
    execute format(
      'create policy tenant_read on %I for select to authenticated using (app_can_access(project_id))', t);
  end loop;
end $$;

-- ---- Tabelas de CONFIG: leitura por membros (escrita por papel vem na V3-4) -
drop policy if exists proj_read on projects;
create policy proj_read on projects for select to authenticated using (app_can_access(id));

drop policy if exists users_read on app_users;
create policy users_read on app_users for select to authenticated
  using (id = auth.uid() or app_is_owner());

drop policy if exists members_read on project_members;
create policy members_read on project_members for select to authenticated
  using (app_can_access(project_id));

drop policy if exists endpoints_read on project_endpoints;
create policy endpoints_read on project_endpoints for select to authenticated
  using (app_can_access(project_id));

drop policy if exists pixels_read on project_pixels;
create policy pixels_read on project_pixels for select to authenticated
  using (app_can_access(project_id));

drop policy if exists utm_read on utm_link_sets;
create policy utm_read on utm_link_sets for select to authenticated
  using (app_can_access(project_id));

drop policy if exists imports_read on import_batches;
create policy imports_read on import_batches for select to authenticated
  using (app_can_access(project_id));

-- project_credentials: SEM política para authenticated -> negado por padrão.
-- (Só service_role lê, na sync/webhook. O segredo nunca chega ao browser.)
