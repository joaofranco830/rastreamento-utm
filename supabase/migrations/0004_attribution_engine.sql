-- =============================================================================
-- 0004_attribution_engine.sql — Fase 3 (atribuição: o coração)
-- - classify_origin(): taxonomia da origem (paid_meta, organic, etc.)
-- - attribute_order(): last-click 7d determinístico + fallback por contato
--   (DORMENTE: visitors.contact_hash é sempre NULL até o t.js capturar contato)
-- - apply_hotmart_event(): passa a chamar attribute_order no branch 'active'
--
-- Regras (ADR-3/ADR-4):
--   * janela (order_date - 7d, order_date], em UTC; fuso só na leitura.
--   * origin = JSON (snapshot do toque vencedor) -> Fase 4 liga ad_id sem migração.
--   * sem match = sem linha em attributions (orgânico/sem atribuição é a AUSÊNCIA).
--   * reembolso herda a atribuição (não recomputa em removed/partial).
-- =============================================================================

-- Classificação da origem a partir do toque vencedor.
create or replace function classify_origin(
  p_source text, p_medium text, p_fbclid text, p_referrer text
) returns text
language sql immutable as $$
  select case
    when lower(coalesce(p_source, '')) in ('facebook','instagram','fb','ig','meta')
      or lower(coalesce(p_medium, '')) in ('paid','cpc','paidsocial','paid_social','ppc')
        then 'paid_meta'
    when coalesce(p_fbclid, '') <> '' then 'paid_meta_fbclid'  -- fbclid sem UTM = pago Meta
    when coalesce(p_source, '') <> '' or coalesce(p_medium, '') <> '' then 'other_utm'
    when p_referrer ~* '(google\.|bing\.|duckduckgo\.|search\.yahoo|l\.instagram|l\.facebook|lm\.facebook|t\.co|linkedin|youtube)'
        then 'organic'
    when coalesce(p_referrer, '') <> '' then 'referral'
    else 'direct'
  end;
$$;

-- Snapshot JSON do toque vencedor (origem auto-contida e auditável).
create or replace function build_origin_json(t touchpoints, p_via text)
returns jsonb
language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'class',         classify_origin(t.utm_source, t.utm_medium, t.fbclid, t.referrer),
    'utm_source',    t.utm_source,
    'utm_medium',    t.utm_medium,
    'utm_campaign',  t.utm_campaign,
    'utm_term',      t.utm_term,
    'utm_content',   t.utm_content,
    'fbclid',        t.fbclid,
    'referrer',      t.referrer,
    'page',          t.page,
    'touchpoint_id', t.id,
    'touchpoint_ts', t.ts,
    'via',           p_via
  ));
$$;

-- Motor de atribuição. Idempotente (upsert por order_id) e re-executável.
-- Retorna: 'deterministic' | 'fallback' | 'unattributed' | 'no_order'.
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

  -- Âncora da janela: data da venda; se faltar (payload malformado), a hora de
  -- ingestão como melhor proxy (raro). A coorte contábil usa order_date à parte.
  v_anchor := coalesce(v_order.order_date, v_order.created_at);

  -- 1) Determinístico: visitor conhecido (origin.src casou no webhook).
  if v_order.visitor_id is not null then
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
      -- visitor conhecido, mas sem clique pago na janela -> orgânico/direto.
      v_origin := jsonb_build_object('class', 'organic');
    end if;

    insert into attributions (order_id, ad_id, origin, model, match_type)
    values (p_order_id, null, v_origin::text, 'last_click_7d', 'deterministic')
    on conflict (order_id) do update set
      ad_id = excluded.ad_id, origin = excluded.origin,
      model = excluded.model, match_type = excluded.match_type, created_at = now();
    return 'deterministic';
  end if;

  -- 2) Fallback por contato (DORMENTE hoje: visitors.contact_hash sempre NULL).
  --    Casa o contato do comprador com um visitante que teve checkout_iniciado
  --    na janela (cross-device / cookie perdido) e usa o last-click dele.
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
        and v.contact_hash = v_order.contact_hash   -- '=' (nunca 'is not distinct from')
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
        model = excluded.model, match_type = excluded.match_type, created_at = now();
      return 'fallback';
    end if;
  end if;

  -- 3) Sem match: remove atribuição antiga (converge) e não cria linha.
  delete from attributions where order_id = p_order_id;
  return 'unattributed';
end;
$$;

-- -----------------------------------------------------------------------------
-- apply_hotmart_event: idem 0003, agora chamando attribute_order no 'active'.
-- A chamada é tolerante a falha (atribuição nunca derruba a venda/webhook).
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

    -- atribuição inline (tolerante: nunca derruba a venda)
    begin
      perform attribute_order(v_order_id);
    exception when others then
      raise warning 'attribute_order falhou (order %): %', v_order_id, sqlerrm;
    end;

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

-- Só o service_role executa estas funções.
revoke all on function classify_origin(text, text, text, text) from public;
revoke execute on function classify_origin(text, text, text, text) from anon, authenticated;
revoke all on function build_origin_json(touchpoints, text) from public;
revoke execute on function build_origin_json(touchpoints, text) from anon, authenticated;
revoke all on function attribute_order(bigint) from public;
revoke execute on function attribute_order(bigint) from anon, authenticated;
