-- =============================================================================
-- 0010_dashboard_metrics.sql — Fase 5: camada de métricas (leitura rápida)
-- Funções consumidas pelo dashboard. Tudo LÍQUIDO (net_value) e por COORTE
-- (order_date) — regras de ouro. Período em datas do fuso do negócio (SP).
-- =============================================================================

-- Resumo do período: cabeça (investido/vendas/faturamento/ROAS) + funil +
-- reconciliação (totais do Meta vs nosso) + reembolso. Retorna JSON.
create or replace function dashboard_summary(p_from date, p_to date)
returns json
language sql stable as $$
  with bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo')        as ts_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo')     as ts_to
  ),
  m as (
    select coalesce(sum(spend),0) as invested, coalesce(sum(impressions),0) as impressions,
           coalesce(sum(clicks),0) as clicks, coalesce(sum(link_clicks),0) as link_clicks,
           coalesce(sum(lpv),0) as lpv, coalesce(sum(ic),0) as ic, coalesce(sum(purchases),0) as purchases
    from meta_insights_daily where date between p_from and p_to
  ),
  o as (
    select coalesce(sum(net_value),0) as net_revenue, coalesce(sum(gross_value),0) as gross_revenue,
           coalesce(sum(refunded_value),0) as refunded,
           count(*) filter (where gross_value > 0) as paid_count,
           count(*) filter (where gross_value > 0 and status in ('refunded','chargeback','cancelled','canceled')) as reverted_count
    from orders, bounds
    where order_date >= bounds.ts_from and order_date < bounds.ts_to
  ),
  e as (
    select count(*) filter (where type='pageview') as pageviews,
           count(*) filter (where type='checkout_iniciado') as checkouts
    from tracking_events, bounds
    where ts >= bounds.ts_from and ts < bounds.ts_to
  )
  select json_build_object(
    'period', json_build_object('from', p_from, 'to', p_to),
    'invested', m.invested,
    'net_revenue', o.net_revenue,
    'gross_revenue', o.gross_revenue,
    'refunded', o.refunded,
    'net_sales', o.paid_count - o.reverted_count,
    'paid_count', o.paid_count,
    'reverted_count', o.reverted_count,
    'roas', case when m.invested > 0 then round(o.net_revenue / m.invested, 2) end,
    'refund_rate_count', case when o.paid_count > 0 then round(o.reverted_count::numeric / o.paid_count, 4) else 0 end,
    'refund_rate_value', case when o.gross_revenue > 0 then round(o.refunded / o.gross_revenue, 4) else 0 end,
    'pageviews', e.pageviews,
    'checkouts', e.checkouts,
    'meta', json_build_object('impressions', m.impressions, 'clicks', m.clicks, 'link_clicks', m.link_clicks,
                              'lpv', m.lpv, 'ic', m.ic, 'purchases', m.purchases),
    'funnel', json_build_object(
      'connect_rate',  case when m.link_clicks > 0 then round(e.pageviews::numeric / m.link_clicks, 4) end,
      'to_checkout',   case when e.pageviews   > 0 then round(e.checkouts::numeric / e.pageviews, 4) end,
      'checkout_conv', case when e.checkouts   > 0 then round((o.paid_count - o.reverted_count)::numeric / e.checkouts, 4) end,
      'funnel_conv',   case when e.pageviews   > 0 then round((o.paid_count - o.reverted_count)::numeric / e.pageviews, 4) end
    )
  ) from m, o, e;
$$;

-- Tabela por campanha: gasto (Meta) + faturamento líquido atribuído (nosso) + ROAS.
-- Inclui a linha 'Sem atribuição' (vendas ainda não ligadas a um anúncio).
create or replace function dashboard_by_campaign(p_from date, p_to date)
returns table (
  campaign     text,
  invested     numeric,
  net_revenue  numeric,
  net_sales    bigint,
  roas         numeric
)
language sql stable as $$
  with bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo')    as ts_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as ts_to
  ),
  -- gasto por campanha (via ad -> adset -> campaign)
  spend_by_camp as (
    select c.id as campaign_id, c.name as campaign, coalesce(sum(mi.spend),0) as invested
    from meta_insights_daily mi
    join ads a on a.id = mi.ad_id
    join adsets s on s.id = a.adset_id
    join campaigns c on c.id = s.campaign_id
    where mi.date between p_from and p_to
    group by c.id, c.name
  ),
  -- faturamento atribuído por campanha (via attributions.ad_id)
  rev_by_camp as (
    select c.id as campaign_id,
           coalesce(sum(o.net_value),0) as net_revenue,
           count(*) filter (where o.gross_value > 0 and o.status not in ('refunded','chargeback','cancelled','canceled')) as net_sales
    from orders o
    join bounds b on (o.order_date >= b.ts_from and o.order_date < b.ts_to)
    join attributions at on at.order_id = o.id
    join ads a on a.id = at.ad_id
    join adsets s on s.id = a.adset_id
    join campaigns c on c.id = s.campaign_id
    group by c.id
  )
  select
    coalesce(sc.campaign, rc_named.campaign) as campaign,
    coalesce(sc.invested, 0) as invested,
    coalesce(rc.net_revenue, 0) as net_revenue,
    coalesce(rc.net_sales, 0) as net_sales,
    case when coalesce(sc.invested,0) > 0 then round(coalesce(rc.net_revenue,0) / sc.invested, 2) end as roas
  from spend_by_camp sc
  full outer join rev_by_camp rc on rc.campaign_id = sc.campaign_id
  left join campaigns rc_named on rc_named.id = rc.campaign_id

  union all
  -- vendas sem atribuição (sem ad ligado)
  select 'Sem atribuição' as campaign, 0 as invested,
         coalesce(sum(o.net_value),0) as net_revenue,
         count(*) filter (where o.gross_value > 0 and o.status not in ('refunded','chargeback','cancelled','canceled')) as net_sales,
         null::numeric as roas
  from orders o
  join bounds b on (o.order_date >= b.ts_from and o.order_date < b.ts_to)
  left join attributions at on at.order_id = o.id
  where at.ad_id is null and o.gross_value > 0
  having count(*) filter (where o.gross_value > 0) > 0

  order by invested desc nulls last, net_revenue desc;
$$;

revoke all on function dashboard_summary(date, date) from public;
revoke all on function dashboard_by_campaign(date, date) from public;
-- o dashboard lê via service_role (servidor); leitura por usuário autenticado é
-- intermediada pelo backend, então não concedemos a anon/authenticated.
revoke execute on function dashboard_summary(date, date) from anon, authenticated;
revoke execute on function dashboard_by_campaign(date, date) from anon, authenticated;
