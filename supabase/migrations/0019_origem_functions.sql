-- =============================================================================
-- 0019_origem_functions.sql — Fase V2-3/V2-5 (camada de dados: Origem + Clientes)
-- Fonte de verdade: arquitetura-rastreamento-utm-v2.md (§5, §8.2, §11).
--
-- ADITIVA: funções de leitura novas. Líquido + coorte + fuso SP. Escopo por
-- produtos incluídos (sem produto incluído => todos). search_path fixo;
-- revogadas de anon/authenticated. PII (buyer_email/name) só via service_role.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- origem_overview: rastreadas vs não rastreadas, por classe (organic/meta/...),
-- e por source/medium. "Não rastreada" = venda sem linha em attributions.
-- ----------------------------------------------------------------------------
create or replace function origem_overview(p_from date, p_to date)
returns json
language sql stable
set search_path = public
as $$
  with bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo')    as ts_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as ts_to
  ),
  incl as (
    select case when exists (select 1 from products where included)
                then array(select product_id from products where included) end as ids
  ),
  base as (
    select o.net_value, o.status,
           (at.id is not null) as tracked,
           at.origin::jsonb as origin
    from orders o
    left join attributions at on at.order_id = o.id
    cross join incl
    cross join bounds b
    where o.order_date >= b.ts_from and o.order_date < b.ts_to
      and o.gross_value > 0
      and (incl.ids is null or o.product_id = any(incl.ids))
  ),
  flagged as (
    select net_value, tracked,
           coalesce(origin->>'class', '(sem atribuição)') as class,
           coalesce(origin->>'utm_source', '(direto)')    as source,
           coalesce(origin->>'utm_medium', '(nenhum)')    as medium,
           (coalesce(status,'') = any(array['refunded','chargeback','cancelled','canceled'])) as reverted
    from base
  )
  select json_build_object(
    'total',     json_build_object('sales', count(*) filter (where not reverted), 'net_revenue', coalesce(sum(net_value),0)),
    'tracked',   json_build_object('sales', count(*) filter (where tracked and not reverted),     'net_revenue', coalesce(sum(net_value) filter (where tracked),0)),
    'untracked', json_build_object('sales', count(*) filter (where not tracked and not reverted), 'net_revenue', coalesce(sum(net_value) filter (where not tracked),0)),
    'by_class', (
      select coalesce(json_agg(x order by x.net_revenue desc), '[]'::json) from (
        select class,
               count(*) filter (where not reverted) as sales,
               coalesce(sum(net_value),0) as net_revenue
        from flagged group by class
      ) x
    ),
    'by_source_medium', (
      select coalesce(json_agg(x order by x.net_revenue desc), '[]'::json) from (
        select source, medium,
               count(*) filter (where not reverted) as sales,
               coalesce(sum(net_value),0) as net_revenue
        from flagged group by source, medium
      ) x
    )
  ) from flagged;
$$;

-- ----------------------------------------------------------------------------
-- customers_list: 1 linha por e-mail (consolidado), no escopo/período.
-- ----------------------------------------------------------------------------
create or replace function customers_list(p_from date, p_to date)
returns table (
  buyer_email text,
  buyer_name  text,
  orders      bigint,
  net_revenue numeric,
  first_order timestamptz,
  last_order  timestamptz,
  last_class  text
)
language sql stable
set search_path = public
as $$
  with bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo')    as ts_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as ts_to
  ),
  incl as (
    select case when exists (select 1 from products where included)
                then array(select product_id from products where included) end as ids
  ),
  base as (
    select o.buyer_email, o.buyer_name, o.net_value, o.order_date,
           at.origin::jsonb ->> 'class' as class
    from orders o
    left join attributions at on at.order_id = o.id
    cross join incl
    cross join bounds b
    where o.order_date >= b.ts_from and o.order_date < b.ts_to
      and o.buyer_email is not null
      and (incl.ids is null or o.product_id = any(incl.ids))
  )
  select buyer_email,
         (array_agg(buyer_name order by order_date desc nulls last))[1] as buyer_name,
         count(*) as orders,
         coalesce(sum(net_value),0) as net_revenue,
         min(order_date) as first_order,
         max(order_date) as last_order,
         (array_agg(class order by order_date desc nulls last))[1] as last_class
  from base
  group by buyer_email
  order by net_revenue desc;
$$;

-- ----------------------------------------------------------------------------
-- customer_history: compras de um e-mail (produto, data, origem por compra).
-- ----------------------------------------------------------------------------
create or replace function customer_history(p_buyer_email text)
returns table (
  transaction   text,
  product_id    text,
  product_name  text,
  order_date    timestamptz,
  net_value     numeric,
  status        text,
  origin_class  text,
  utm_campaign  text
)
language sql stable
set search_path = public
as $$
  select o.transaction, o.product_id, p.name, o.order_date, o.net_value, o.status,
         at.origin::jsonb ->> 'class'        as origin_class,
         at.origin::jsonb ->> 'utm_campaign' as utm_campaign
  from orders o
  left join products p     on p.product_id = o.product_id
  left join attributions at on at.order_id = o.id
  where o.buyer_email = p_buyer_email
  order by o.order_date desc nulls last;
$$;

revoke all on function origem_overview(date, date)  from public;
revoke all on function customers_list(date, date)   from public;
revoke all on function customer_history(text)       from public;
revoke execute on function origem_overview(date, date) from anon, authenticated;
revoke execute on function customers_list(date, date)  from anon, authenticated;
revoke execute on function customer_history(text)      from anon, authenticated;
