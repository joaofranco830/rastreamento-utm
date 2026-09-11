-- =============================================================================
-- 0051_isolate_individual_data.sql — isola DADOS INDIVIDUAIS por projeto.
--
-- Antes: orders.transaction e visitors.visitor_id eram ÚNICOS GLOBAIS — um
-- dado individual (uma transação Hotmart, um visitante) só podia existir em UM
-- projeto no sistema inteiro. Se dois projetos usassem a mesma conta Hotmart,
-- ou um visitor_id colidisse entre projetos, havia acoplamento/vazamento.
--
-- Agora: chave por (project_id, <id>). Cada projeto tem seu próprio espaço.
-- Dados já verificados 100% consistentes (nenhuma linha com project_id != do
-- visitante referenciado), então a troca é segura. PG17: usamos
-- ON DELETE SET NULL (visitor_id) para não violar orders.project_id NOT NULL.
-- =============================================================================

-- 1) orders.transaction: único global → único por projeto.
alter table orders drop constraint if exists orders_transaction_key;
alter table orders add constraint orders_project_transaction_key unique (project_id, transaction);

-- 2) visitors: PK global (visitor_id) → PK composta (project_id, visitor_id).
alter table orders          drop constraint if exists orders_visitor_id_fkey;
alter table touchpoints     drop constraint if exists touchpoints_visitor_id_fkey;
alter table tracking_events drop constraint if exists tracking_events_visitor_id_fkey;

alter table visitors drop constraint if exists visitors_pkey;
alter table visitors add constraint visitors_pkey primary key (project_id, visitor_id);

-- FKs recriadas como compostas, mantendo o ON DELETE de antes.
alter table orders add constraint orders_visitor_fkey
  foreign key (project_id, visitor_id) references visitors(project_id, visitor_id)
  on delete set null (visitor_id);
alter table touchpoints add constraint touchpoints_visitor_fkey
  foreign key (project_id, visitor_id) references visitors(project_id, visitor_id)
  on delete cascade;
alter table tracking_events add constraint tracking_events_visitor_fkey
  foreign key (project_id, visitor_id) references visitors(project_id, visitor_id)
  on delete cascade;

-- 3) apply_hotmart_event: conflito e buscas escopados por projeto.
create or replace function public.apply_hotmart_event(
  p_transaction text, p_event_id text, p_event_type text, p_event_value numeric,
  p_effect text, p_visitor_id text, p_contact_hash text, p_gross numeric,
  p_order_date timestamptz, p_status text, p_raw jsonb, p_project_id bigint default 1
) returns text language plpgsql set search_path to 'public' as $function$
declare
  v_order_id bigint;
  v_visitor  text := null;
  v_pid      bigint := coalesce(p_project_id, 1);
begin
  -- visitante só conta se existir NESTE projeto
  if p_visitor_id is not null and exists (
    select 1 from visitors where visitor_id = p_visitor_id and project_id = v_pid
  ) then
    v_visitor := p_visitor_id;
  end if;

  insert into orders (transaction, gross_value, refunded_value, status, order_date, raw_payload, project_id)
  values (p_transaction, 0, 0, coalesce(p_status, 'unknown'), p_order_date, p_raw, v_pid)
  on conflict (project_id, transaction) do nothing;

  select id into v_order_id from orders
  where transaction = p_transaction and project_id = v_pid for update;

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
$function$;
