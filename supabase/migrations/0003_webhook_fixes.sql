-- =============================================================================
-- 0003_webhook_fixes.sql — correções da revisão adversarial da Fase 2
-- 1) branch 'partial' não regride status terminal (refunded/chargeback/cancelled)
-- 2) order_events.type nunca nulo (coalesce -> 'unknown') — evita 500/retry infinito
-- 3) revoga EXECUTE da RPC também de anon/authenticated (defesa em profundidade:
--    só o service_role chama a função)
-- =============================================================================

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
  v_terminal text[] := array['refunded', 'chargeback', 'cancelled', 'canceled'];
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

  if p_effect = 'active' then
    update orders set
      gross_value    = case when gross_value = 0 then coalesce(p_gross, gross_value) else gross_value end,
      refunded_value = case when status = any(v_terminal)
                            then (case when gross_value = 0 then coalesce(p_gross, 0) else gross_value end)
                            else refunded_value end,
      status         = case when status = any(v_terminal) then status else p_status end,
      order_date     = coalesce(order_date, p_order_date),
      visitor_id     = coalesce(visitor_id, v_visitor),
      contact_hash   = coalesce(contact_hash, p_contact_hash),
      raw_payload    = p_raw
    where id = v_order_id;

  elsif p_effect = 'removed' then
    update orders set
      refunded_value = gross_value,
      status         = p_status,
      visitor_id     = coalesce(visitor_id, v_visitor),
      contact_hash   = coalesce(contact_hash, p_contact_hash),
      raw_payload    = p_raw
    where id = v_order_id;

  elsif p_effect = 'partial' then
    update orders set
      refunded_value = least(gross_value, refunded_value + coalesce(p_event_value, 0)),
      -- não regride status terminal (igual aos outros branches)
      status         = case when status = any(v_terminal) then status else 'partially_refunded' end,
      visitor_id     = coalesce(visitor_id, v_visitor),
      contact_hash   = coalesce(contact_hash, p_contact_hash),
      raw_payload    = p_raw
    where id = v_order_id;

  else
    update orders set
      status       = case when status = any(v_terminal) then status else p_status end,
      visitor_id   = coalesce(visitor_id, v_visitor),
      contact_hash = coalesce(contact_hash, p_contact_hash),
      raw_payload  = p_raw
    where id = v_order_id;
  end if;

  return 'processed';
end;
$$;

-- Só o service_role (servidor) executa. anon/authenticated recebem grant direto
-- por padrão no Supabase, então o revoke de public não basta.
revoke all on function apply_hotmart_event(text, text, text, numeric, text, text, text, numeric, timestamptz, text, jsonb) from public;
revoke execute on function apply_hotmart_event(text, text, text, numeric, text, text, text, numeric, timestamptz, text, jsonb) from anon, authenticated;
