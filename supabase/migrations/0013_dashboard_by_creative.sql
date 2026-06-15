-- =============================================================================
-- 0013_dashboard_by_creative.sql — atribuição/relatório por CRIATIVO
-- utm_content = NOME do criativo no Meta (ex.: geo-voz-ad0012). O mesmo criativo
-- pode existir em vários anúncios (reuso em campanhas/posições), então agrupamos
-- por NOME: gasto = soma de todos os anúncios com aquele nome; receita = vendas
-- cujo utm_content = aquele nome. Join por nome (case-insensitive). Sem ad_id.
-- =============================================================================
create or replace function dashboard_by_creative(p_from date, p_to date)
returns table (creative text, invested numeric, net_revenue numeric, net_sales bigint, roas numeric)
language sql stable as $$
  with bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo')    as ts_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as ts_to
  ),
  spend as (
    select lower(trim(a.name)) as k, max(a.name) as creative, coalesce(sum(mi.spend),0) as invested
    from meta_insights_daily mi
    join ads a on a.id = mi.ad_id
    where mi.date between p_from and p_to and a.name is not null
    group by lower(trim(a.name))
  ),
  rev as (
    select lower(trim(at.origin::jsonb ->> 'utm_content')) as k,
           max(at.origin::jsonb ->> 'utm_content') as creative,
           coalesce(sum(o.net_value),0) as net_revenue,
           count(*) filter (where coalesce(o.status,'') <> all(array['refunded','chargeback','cancelled','canceled'])) as net_sales
    from orders o
    join bounds b on (o.order_date >= b.ts_from and o.order_date < b.ts_to)
    join attributions at on at.order_id = o.id
    where o.gross_value > 0 and (at.origin::jsonb ->> 'utm_content') is not null
    group by lower(trim(at.origin::jsonb ->> 'utm_content'))
  )
  select
    coalesce(s.creative, r.creative)      as creative,
    coalesce(s.invested, 0)               as invested,
    coalesce(r.net_revenue, 0)            as net_revenue,
    coalesce(r.net_sales, 0)              as net_sales,
    case when coalesce(s.invested,0) > 0 then round(coalesce(r.net_revenue,0) / s.invested, 2) end as roas
  from spend s
  full outer join rev r on r.k = s.k
  order by net_revenue desc nulls last, invested desc;
$$;

revoke all on function dashboard_by_creative(date, date) from public;
revoke execute on function dashboard_by_creative(date, date) from anon, authenticated;
