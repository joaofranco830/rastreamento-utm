-- =============================================================================
-- 0025_v3_rpcs_per_project.sql — Fase V3-2 (RPCs por projeto + leitor do Vault)
-- Fonte de verdade: arquitetura-rastreamento-utm-v3.md (§5.4, §7, §9 e Fase V3-2).
--
-- ADITIVA e RETROCOMPATÍVEL. Não apaga dado. As funções de escrita ganham
-- consciência de tenant SEM quebrar o app ao vivo:
--   * apply_hotmart_event ganha `p_project_id bigint default 1` (último arg) ->
--     o webhook atual, que chama com os 11 args nomeados, resolve para a nova
--     função usando o default (Projeto Padrão). Idêntico ao de hoje.
--   * attribute_order passa a filtrar touchpoints pelo project_id do pedido e a
--     carimbar attributions.project_id (defesa; p/ Padrão é idêntico).
--   * prune_raw_events poda POR PROJETO (retention_days de cada tracking_config).
-- Também: leitor da chave-mestra do Vault (server-only), project_id no
-- meta_sync_state, e geração de endpoint_key/pixel_key do Projeto Padrão.
-- search_path fixo em tudo (regra de ouro).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Leitor da chave-mestra do cofre (ADR-v3-7a). SECURITY DEFINER lê o Vault;
-- execução liberada SÓ para service_role (sync/webhook server-side). anon e
-- authenticated NÃO podem ler segredo de forma alguma.
-- -----------------------------------------------------------------------------
create or replace function app_get_master_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'credentials_master_key' limit 1;
$$;

revoke all on function app_get_master_key() from public, anon, authenticated;
grant execute on function app_get_master_key() to service_role;

-- -----------------------------------------------------------------------------
-- apply_hotmart_event — agora carimba project_id (default 1 = retrocompat).
-- -----------------------------------------------------------------------------
drop function if exists apply_hotmart_event(text, text, text, numeric, text, text, text, numeric, timestamptz, text, jsonb);

create function apply_hotmart_event(
  p_transaction text, p_event_id text, p_event_type text, p_event_value numeric,
  p_effect text, p_visitor_id text, p_contact_hash text, p_gross numeric,
  p_order_date timestamptz, p_status text, p_raw jsonb,
  p_project_id bigint default 1
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_order_id bigint;
  v_visitor  text := null;
  v_pid      bigint := coalesce(p_project_id, 1);
begin
  if p_visitor_id is not null
     and exists (select 1 from visitors where visitor_id = p_visitor_id) then
    v_visitor := p_visitor_id;
  end if;

  insert into orders (transaction, gross_value, refunded_value, status, order_date, raw_payload, project_id)
  values (p_transaction, 0, 0, coalesce(p_status, 'unknown'), p_order_date, p_raw, v_pid)
  on conflict (transaction) do nothing;

  select id into v_order_id from orders where transaction = p_transaction for update;

  begin
    insert into order_events (order_id, type, value, event_id, raw_payload, project_id)
    values (v_order_id, coalesce(p_event_type, 'unknown'), p_event_value, p_event_id, p_raw, v_pid);
  exception when unique_violation then
    return 'duplicate';
  end;

  update orders set
    order_date   = coalesce(order_date, p_order_date),
    visitor_id   = coalesce(visitor_id, v_visitor),
    contact_hash = coalesce(contact_hash, p_contact_hash),
    raw_payload  = p_raw
  where id = v_order_id;

  perform recompute_order_totals(v_order_id);

  begin
    perform attribute_order(v_order_id);
  exception when others then
    raise warning 'attribute_order falhou (order %): % [%]', v_order_id, sqlerrm, sqlstate;
  end;

  return 'processed';
end;
$$;

revoke all on function apply_hotmart_event(text, text, text, numeric, text, text, text, numeric, timestamptz, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function apply_hotmart_event(text, text, text, numeric, text, text, text, numeric, timestamptz, text, jsonb, bigint) to service_role;

-- -----------------------------------------------------------------------------
-- attribute_order — last-click 7d com defesa por project_id + carimbo do tenant.
-- (Para o Projeto Padrão, project_id=1 em tudo -> resultado idêntico.)
-- -----------------------------------------------------------------------------
create or replace function attribute_order(p_order_id bigint)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_order  orders%rowtype;
  v_anchor timestamptz;
  v_tp     touchpoints%rowtype;
  v_origin jsonb;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then
    return 'no_order';
  end if;

  v_anchor := coalesce(v_order.order_date, v_order.created_at);

  if v_order.visitor_id is not null then
    select * into v_tp
    from touchpoints t
    where t.visitor_id = v_order.visitor_id
      and t.project_id = v_order.project_id
      and t.ts <= v_anchor
      and t.ts >  v_anchor - interval '7 days'
      and (t.utm_source is not null or t.utm_medium is not null
        or t.utm_campaign is not null or t.utm_term is not null
        or t.utm_content is not null or t.fbclid is not null)
    order by t.ts desc, t.id desc
    limit 1;

    if found then
      v_origin := build_origin_json(v_tp, null);
    else
      select * into v_tp
      from touchpoints t
      where t.visitor_id = v_order.visitor_id
        and t.project_id = v_order.project_id
        and t.ts <= v_anchor
        and t.ts >  v_anchor - interval '7 days'
      order by t.ts desc, t.id desc
      limit 1;
      if found then
        v_origin := build_origin_json(v_tp, null);
      else
        v_origin := jsonb_build_object('class', 'direct');
      end if;
    end if;

    insert into attributions (order_id, ad_id, origin, model, match_type, project_id)
    values (p_order_id, null, v_origin::text, 'last_click_7d', 'deterministic', v_order.project_id)
    on conflict (order_id) do update set
      ad_id = excluded.ad_id, origin = excluded.origin,
      model = excluded.model, match_type = excluded.match_type;
    return 'deterministic';
  end if;

  if v_order.contact_hash is not null then
    select t.* into v_tp
    from touchpoints t
    join (
      select te.visitor_id, max(te.ts) as last_ic
      from tracking_events te
      join visitors v on v.visitor_id = te.visitor_id
      where te.type = 'checkout_iniciado'
        and te.ts <= v_anchor
        and te.ts >  v_anchor - interval '7 days'
        and v.contact_hash is not null
        and v.contact_hash = v_order.contact_hash
        and v.project_id = v_order.project_id
      group by te.visitor_id
    ) cv on cv.visitor_id = t.visitor_id
    where t.project_id = v_order.project_id
      and t.ts <= v_anchor
      and t.ts >  v_anchor - interval '7 days'
      and (t.utm_source is not null or t.utm_medium is not null
        or t.utm_campaign is not null or t.utm_term is not null
        or t.utm_content is not null or t.fbclid is not null)
    order by cv.last_ic desc, t.ts desc, t.id desc
    limit 1;

    if found then
      v_origin := build_origin_json(v_tp, 'contact_fallback');
      insert into attributions (order_id, ad_id, origin, model, match_type, project_id)
      values (p_order_id, null, v_origin::text, 'last_click_7d', 'fallback', v_order.project_id)
      on conflict (order_id) do update set
        ad_id = excluded.ad_id, origin = excluded.origin,
        model = excluded.model, match_type = excluded.match_type;
      return 'fallback';
    end if;
  end if;

  return 'unattributed';
end;
$$;

-- -----------------------------------------------------------------------------
-- prune_raw_events — agora poda POR PROJETO, respeitando o retention_days de
-- cada tracking_config. Continua sem tocar orders/agregados/visitors.
-- -----------------------------------------------------------------------------
create or replace function prune_raw_events()
returns text
language plpgsql
set search_path = public
as $$
declare
  r        record;
  v_cutoff timestamptz;
  v_te     bigint := 0;
  v_tp     bigint := 0;
  v_tot_te bigint := 0;
  v_tot_tp bigint := 0;
  v_projs  int    := 0;
begin
  for r in select project_id, greatest(coalesce(retention_days, 90), 1) as days from tracking_config loop
    v_cutoff := now() - make_interval(days => r.days);

    with del as (delete from tracking_events where project_id = r.project_id and ts < v_cutoff returning 1)
    select count(*) into v_te from del;

    with del as (delete from touchpoints where project_id = r.project_id and ts < v_cutoff returning 1)
    select count(*) into v_tp from del;

    v_tot_te := v_tot_te + v_te;
    v_tot_tp := v_tot_tp + v_tp;
    v_projs  := v_projs + 1;
  end loop;

  return format('projects=%s | tracking_events=%s | touchpoints=%s', v_projs, v_tot_te, v_tot_tp);
end;
$$;

revoke all on function prune_raw_events() from public;
revoke execute on function prune_raw_events() from anon, authenticated;

-- -----------------------------------------------------------------------------
-- meta_sync_state ganha project_id (sync por projeto na V3-2). Aditivo: a 1 linha
-- atual vira do Projeto Padrão; o sync atual ignora a coluna (não quebra).
-- -----------------------------------------------------------------------------
alter table meta_sync_state add column if not exists project_id bigint references projects (id);
update meta_sync_state set project_id = 1 where project_id is null;
alter table meta_sync_state alter column project_id set default 1;
alter table meta_sync_state alter column project_id set not null;
create index if not exists idx_meta_sync_state_project on meta_sync_state (project_id);

-- -----------------------------------------------------------------------------
-- Chaves de roteamento do Projeto Padrão (endpoint do webhook + pixel). Tokens
-- aleatórios não-enumeráveis (não são segredo; o segredo é o Hottok no cofre).
-- -----------------------------------------------------------------------------
insert into project_endpoints (project_id, provider, endpoint_key, active)
select 1, 'hotmart', replace(gen_random_uuid()::text, '-', ''), true
where not exists (select 1 from project_endpoints where project_id = 1 and provider = 'hotmart');

insert into project_pixels (project_id, pixel_key, active)
select 1, replace(gen_random_uuid()::text, '-', ''), true
where not exists (select 1 from project_pixels where project_id = 1);
