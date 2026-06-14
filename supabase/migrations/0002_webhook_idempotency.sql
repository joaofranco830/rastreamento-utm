-- =============================================================================
-- 0002_webhook_idempotency.sql — Fase 2 (webhook Hotmart)
-- - Dedupe de eventos por event_id (a Hotmart re-tenta até 5x)
-- - Função atômica apply_hotmart_event(): aplica venda/reembolso com invariantes
--   de ADR-4 (líquido, restatement por coorte, não-regressão de status terminal)
--   à prova de corrida (SELECT ... FOR UPDATE).
-- =============================================================================

-- Coluna de dedupe por entrega da Hotmart (envelope.id).
alter table order_events add column if not exists event_id text;

-- Dedupe: o mesmo evento (mesmo event_id) só entra uma vez. Parcial p/ não
-- afetar linhas sem event_id.
create unique index if not exists uq_order_events_event_id
  on order_events (event_id) where event_id is not null;

-- -----------------------------------------------------------------------------
-- apply_hotmart_event: ponto único e atômico de escrita do webhook.
-- Retorna 'processed' (evento novo, aplicado) ou 'duplicate' (já processado).
--
-- Efeitos (p_effect):
--   active   -> venda ativa: seta gross; refunded só se status anterior for terminal
--   removed  -> reembolso/chargeback/cancelamento: refunded = gross (net = 0)
--   partial  -> reembolso parcial: refunded += valor estornado (trava em gross)
--   ignore   -> apenas registra (status não-decisivo); não mexe em valores
--
-- Invariantes:
--   * net_value é coluna GERADA — nunca escrita aqui.
--   * order_date = data da venda ORIGINAL; nunca sobrescrita por evento posterior.
--   * status terminal (refunded/chargeback/cancelled) não regride para approved.
--   * refunded_value nunca ultrapassa gross_value (least()).
-- -----------------------------------------------------------------------------
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
  -- Só usa o visitor_id se ele já existir em visitors (senão viola a FK).
  if p_visitor_id is not null
     and exists (select 1 from visitors where visitor_id = p_visitor_id) then
    v_visitor := p_visitor_id;
  end if;

  -- Garante a existência do pedido sem corrida; depois trava a linha.
  insert into orders (transaction, gross_value, refunded_value, status, order_date, raw_payload)
  values (p_transaction, 0, 0, p_status, p_order_date, p_raw)
  on conflict (transaction) do nothing;

  select id into v_order_id from orders where transaction = p_transaction for update;

  -- Dedupe do evento: tenta registrar; se já existe, não reaplica nada.
  begin
    insert into order_events (order_id, type, value, event_id, raw_payload)
    values (v_order_id, p_event_type, p_event_value, p_event_id, p_raw);
  exception when unique_violation then
    return 'duplicate';
  end;

  -- Aplica o efeito no pedido (evento é novo).
  if p_effect = 'active' then
    update orders set
      gross_value    = case when gross_value = 0 then coalesce(p_gross, gross_value) else gross_value end,
      -- se já estava terminal (reembolso chegou antes), mantém net=0
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
      refunded_value = gross_value,        -- net = 0, gross preservado p/ auditoria
      status         = p_status,
      visitor_id     = coalesce(visitor_id, v_visitor),
      contact_hash   = coalesce(contact_hash, p_contact_hash),
      raw_payload    = p_raw
    where id = v_order_id;                  -- order_date NÃO tocado (coorte original)

  elsif p_effect = 'partial' then
    update orders set
      refunded_value = least(gross_value, refunded_value + coalesce(p_event_value, 0)),
      status         = 'partially_refunded',
      visitor_id     = coalesce(visitor_id, v_visitor),
      contact_hash   = coalesce(contact_hash, p_contact_hash),
      raw_payload    = p_raw
    where id = v_order_id;

  else -- ignore
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

-- Só o service_role (servidor) executa esta função.
revoke all on function apply_hotmart_event(text, text, text, numeric, text, text, text, numeric, timestamptz, text, jsonb) from public;
