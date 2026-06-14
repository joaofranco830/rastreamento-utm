-- =============================================================================
-- 0005_attribution_review_fixes.sql — correções da revisão adversarial (Fase 3)
-- 1) apply_hotmart_event: gross/refunded/status RECALCULADOS de order_events
--    (ordem-independente -> corrige parcial/terminal fora de ordem; não-regressão)
-- 2) attribute_order: não-destrutivo (não apaga atribuição herdada); preserva
--    created_at; classifica orgânico/referral/direct pelo último toque
-- 3) chamada de attribute_order em TODO evento (idempotente)
-- 4) classify_origin: casamento por host ancorado (sem falsos positivos)
-- =============================================================================

-- Classificação por host do referrer (ancorado por sufixo de domínio).
create or replace function classify_origin(
  p_source text, p_medium text, p_fbclid text, p_referrer text
) returns text
language plpgsql immutable as $$
declare
  v_host text;
begin
  if lower(coalesce(p_source, '')) in ('facebook','instagram','fb','ig','meta')
     or lower(coalesce(p_medium, '')) in ('paid','cpc','paidsocial','paid_social','ppc') then
    return 'paid_meta';
  end if;
  if coalesce(p_fbclid, '') <> '' then
    return 'paid_meta_fbclid';   -- fbclid sem UTM = pago Meta
  end if;
  if coalesce(p_source, '') <> '' or coalesce(p_medium, '') <> '' then
    return 'other_utm';
  end if;
  -- sem UTM/fbclid: decide por host do referrer
  v_host := lower(coalesce(substring(p_referrer from '^[a-z]+://([^/:?#]+)'), ''));
  if v_host = '' then
    return 'direct';
  end if;
  if v_host = 't.co'
     or v_host ~ '(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.com|instagram\.com|facebook\.com|linkedin\.com|youtube\.com)$' then
    return 'organic';
  end if;
  return 'referral';
end;
$$;

-- Motor de atribuição (não-destrutivo, created_at preservado, orgânico classificado).
create or replace function attribute_order(p_order_id bigint)
returns text
language plpgsql as $$
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

  -- 1) Determinístico: visitor casado (origin.src). SEMPRE grava linha (o "match"
  --    é visitor<->venda; a origem paga/orgânica vai em origin.class).
  if v_order.visitor_id is not null then
    -- último toque PAGO (utm/fbclid) na janela
    select * into v_tp
    from touchpoints t
    where t.visitor_id = v_order.visitor_id
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
      -- sem clique pago: classifica pelo ÚLTIMO toque qualquer (organic/referral/direct)
      select * into v_tp
      from touchpoints t
      where t.visitor_id = v_order.visitor_id
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

    insert into attributions (order_id, ad_id, origin, model, match_type)
    values (p_order_id, null, v_origin::text, 'last_click_7d', 'deterministic')
    on conflict (order_id) do update set
      ad_id = excluded.ad_id, origin = excluded.origin,
      model = excluded.model, match_type = excluded.match_type;  -- created_at preservado
    return 'deterministic';
  end if;

  -- 2) Fallback por contato (DORMENTE: visitors.contact_hash sempre NULL hoje)
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
      group by te.visitor_id
    ) cv on cv.visitor_id = t.visitor_id
    where t.ts <= v_anchor
      and t.ts >  v_anchor - interval '7 days'
      and (t.utm_source is not null or t.utm_medium is not null
        or t.utm_campaign is not null or t.utm_term is not null
        or t.utm_content is not null or t.fbclid is not null)
    order by cv.last_ic desc, t.ts desc, t.id desc
    limit 1;

    if found then
      v_origin := build_origin_json(v_tp, 'contact_fallback');
      insert into attributions (order_id, ad_id, origin, model, match_type)
      values (p_order_id, null, v_origin::text, 'last_click_7d', 'fallback')
      on conflict (order_id) do update set
        ad_id = excluded.ad_id, origin = excluded.origin,
        model = excluded.model, match_type = excluded.match_type;  -- created_at preservado
      return 'fallback';
    end if;
  end if;

  -- 3) Sem base para casar (sem visitor e sem fallback): NÃO apaga atribuição
  --    existente (pode ser herdada/auto-contida). Apenas reporta.
  return 'unattributed';
end;
$$;

-- apply_hotmart_event: agrega gross/refunded/status a partir de order_events.
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
  v_order_id     bigint;
  v_visitor      text := null;
  v_terminal     text[] := array['refunded','chargeback','cancelled','canceled'];
  v_gross        numeric;
  v_partial_sum  numeric;
  v_has_terminal boolean;
  v_status       text;
begin
  if p_visitor_id is not null
     and exists (select 1 from visitors where visitor_id = p_visitor_id) then
    v_visitor := p_visitor_id;
  end if;

  insert into orders (transaction, gross_value, refunded_value, status, order_date, raw_payload)
  values (p_transaction, 0, 0, coalesce(p_status, 'unknown'), p_order_date, p_raw)
  on conflict (transaction) do nothing;

  select id into v_order_id from orders where transaction = p_transaction for update;

  -- dedupe por event_id; se já processado, não reaplica
  begin
    insert into order_events (order_id, type, value, event_id, raw_payload)
    values (v_order_id, coalesce(p_event_type, 'unknown'), p_event_value, p_event_id, p_raw);
  exception when unique_violation then
    return 'duplicate';
  end;

  -- RECOMPUTA do log de eventos (ordem-independente, idempotente):
  --  gross   = maior valor entre eventos que carregam o preço cheio (venda/terminal)
  --  refund  = gross (se houve terminal) OU soma dos parciais (travada em gross)
  select coalesce(max(value), 0) into v_gross
    from order_events
    where order_id = v_order_id
      and type in ('approved','complete','refunded','chargeback','cancelled','canceled');

  select coalesce(sum(value), 0) into v_partial_sum
    from order_events where order_id = v_order_id and type = 'partially_refunded';

  select exists(
    select 1 from order_events where order_id = v_order_id and type = any(v_terminal)
  ) into v_has_terminal;

  -- status: terminal (mais recente) > parcial > venda > unknown
  if v_has_terminal then
    select type into v_status from order_events
      where order_id = v_order_id and type = any(v_terminal)
      order by ts desc, id desc limit 1;
  elsif v_partial_sum > 0 then
    v_status := 'partially_refunded';
  elsif v_gross > 0 then
    select type into v_status from order_events
      where order_id = v_order_id and type in ('approved','complete')
      order by ts desc, id desc limit 1;
    v_status := coalesce(v_status, coalesce(p_status, 'unknown'));
  else
    v_status := coalesce(p_status, 'unknown');
  end if;

  update orders set
    gross_value    = v_gross,
    refunded_value = case when v_has_terminal then v_gross else least(v_gross, v_partial_sum) end,
    status         = v_status,
    order_date     = coalesce(order_date, p_order_date),   -- coorte: 1ª data não-nula vence
    visitor_id     = coalesce(visitor_id, v_visitor),
    contact_hash   = coalesce(contact_hash, p_contact_hash),
    raw_payload    = p_raw
  where id = v_order_id;

  -- atribuição em TODO evento (idempotente; herda/atualiza sem churn de created_at).
  -- Tolerante a falha: atribuição é recuperável por backfill; a venda nunca cai.
  begin
    perform attribute_order(v_order_id);
  exception when others then
    raise warning 'attribute_order falhou (order %): % [%]', v_order_id, sqlerrm, sqlstate;
  end;

  return 'processed';
end;
$$;

revoke all on function classify_origin(text, text, text, text) from public;
revoke execute on function classify_origin(text, text, text, text) from anon, authenticated;
revoke all on function attribute_order(bigint) from public;
revoke execute on function attribute_order(bigint) from anon, authenticated;
