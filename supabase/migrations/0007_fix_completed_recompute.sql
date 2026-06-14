-- =============================================================================
-- 0007_fix_completed_recompute.sql — correção crítica (dados reais)
-- BUG: o recálculo (0005) filtrava type IN ('complete',...), mas a Hotmart manda
-- status COMPLETED -> nosso type = 'completed'. Vendas 'completed' ficavam com
-- bruto 0 (subcontagem de faturamento). Inclui 'completed'.
-- Extrai o recálculo para uma função única (recompute_order_totals) usada pelo
-- webhook e pelo backfill, e reprocessa os pedidos existentes.
-- =============================================================================

create or replace function recompute_order_totals(p_order_id bigint)
returns void
language plpgsql as $$
declare
  v_terminal text[] := array['refunded','chargeback','cancelled','canceled'];
  v_active   text[] := array['approved','complete','completed'];
  v_gross        numeric;
  v_partial_sum  numeric;
  v_has_terminal boolean;
  v_status       text;
begin
  -- bruto = maior valor entre eventos que carregam o preço cheio (venda/terminal)
  select coalesce(max(value), 0) into v_gross
    from order_events
    where order_id = p_order_id and type = any(v_active || v_terminal);

  select coalesce(sum(value), 0) into v_partial_sum
    from order_events where order_id = p_order_id and type = 'partially_refunded';

  select exists(select 1 from order_events where order_id = p_order_id and type = any(v_terminal))
    into v_has_terminal;

  if v_has_terminal then
    select type into v_status from order_events
      where order_id = p_order_id and type = any(v_terminal)
      order by ts desc, id desc limit 1;
  elsif v_partial_sum > 0 then
    v_status := 'partially_refunded';
  elsif v_gross > 0 then
    select type into v_status from order_events
      where order_id = p_order_id and type = any(v_active)
      order by ts desc, id desc limit 1;
  else
    select status into v_status from orders where id = p_order_id; -- mantém o atual
  end if;

  update orders set
    gross_value    = v_gross,
    refunded_value = case when v_has_terminal then v_gross else least(v_gross, v_partial_sum) end,
    status         = coalesce(v_status, status)
  where id = p_order_id;
end;
$$;

-- apply_hotmart_event passa a usar recompute_order_totals (fonte única do cálculo).
create or replace function apply_hotmart_event(
  p_transaction  text,
  p_event_id     text,
  p_event_type   text,
  p_event_value  numeric,
  p_effect       text,
  p_visitor_id   text,
  p_contact_hash text,
  p_gross        numeric,
  p_order_date   timestamptz,
  p_status       text,
  p_raw          jsonb
) returns text
language plpgsql
as $$
declare
  v_order_id bigint;
  v_visitor  text := null;
begin
  if p_visitor_id is not null
     and exists (select 1 from visitors where visitor_id = p_visitor_id) then
    v_visitor := p_visitor_id;
  end if;

  insert into orders (transaction, gross_value, refunded_value, status, order_date, raw_payload)
  values (p_transaction, 0, 0, coalesce(p_status, 'unknown'), p_order_date, p_raw)
  on conflict (transaction) do nothing;

  select id into v_order_id from orders where transaction = p_transaction for update;

  begin
    insert into order_events (order_id, type, value, event_id, raw_payload)
    values (v_order_id, coalesce(p_event_type, 'unknown'), p_event_value, p_event_id, p_raw);
  exception when unique_violation then
    return 'duplicate';
  end;

  -- metadados (1ª data/visitor/contato não-nulos vencem); valores são recomputados
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

revoke all on function recompute_order_totals(bigint) from public;
revoke execute on function recompute_order_totals(bigint) from anon, authenticated;

-- reprocessa os pedidos existentes com a lógica corrigida
do $$ begin perform recompute_order_totals(id) from orders; end $$;
