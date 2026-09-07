-- =============================================================================
-- 0031_dashboard_ad_account_filter.sql — filtro de conta de anúncio no dashboard
--
-- Adiciona um 4º parâmetro p_ad_accounts (text[] de meta_account_id) ao
-- central_summary e central_timeseries. Quando NULL/vazio -> todas as contas
-- (comportamento atual). Quando informado -> só as campanhas dessas contas
-- entram no "investido"/impressões/cliques (métricas do Meta). Receita (orders)
-- não muda — não é presa a conta de anúncio.
--
-- ADITIVO: dropa as versões de 3 args e recria com o arg extra COM DEFAULT NULL,
-- então quem chamar com 3 args (ou omitir p_ad_accounts) mantém o resultado.
-- Só o lib/central.ts consome estas funções.
-- =============================================================================

drop function if exists central_summary(bigint, date, date);
drop function if exists central_timeseries(bigint, date, date);

-- ---------------------------------------------------------------- central_summary
create function central_summary(p_project_id bigint, p_from date, p_to date, p_ad_accounts text[] default null)
returns json language sql stable set search_path to 'public' as $function$
  with cfg as (
    select coalesce((select campaign_name_tags from tracking_config where project_id = p_project_id), '{}'::text[]) as tags
  ),
  bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo')    as ts_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as ts_to
  ),
  incl as (
    select case when exists (select 1 from products where included and project_id = p_project_id)
                then array(select product_id from products where included and project_id = p_project_id) end as ids
  ),
  sel_camp as (
    select c.id, c.name
    from campaigns c, cfg
    where c.project_id = p_project_id
      and (cardinality(cfg.tags) = 0
       or exists (select 1 from unnest(cfg.tags) t where c.name ilike '%' || t || '%'))
      and (p_ad_accounts is null or cardinality(p_ad_accounts) = 0
       or c.ad_account_id in (select id from ad_accounts
                              where project_id = p_project_id and meta_account_id = any(p_ad_accounts)))
  ),
  m as (
    select coalesce(sum(mi.spend),0)       as invested,
           coalesce(sum(mi.impressions),0) as impressions,
           coalesce(sum(mi.clicks),0)      as clicks,
           coalesce(sum(mi.link_clicks),0) as link_clicks
    from meta_insights_daily mi
    join ads a    on a.id = mi.ad_id
    join adsets s on s.id = a.adset_id
    join sel_camp c on c.id = s.campaign_id
    where mi.date between p_from and p_to and mi.project_id = p_project_id
  ),
  o_scoped as (
    select o.net_value, o.gross_value, o.refunded_value, o.status,
           coalesce(p.role, 'other') as role
    from orders o
    left join products p on p.product_id = o.product_id and p.project_id = p_project_id
    cross join incl, bounds b
    where o.project_id = p_project_id
      and o.order_date >= b.ts_from and o.order_date < b.ts_to
      and (incl.ids is null or o.product_id = any(incl.ids))
  ),
  o as (
    select coalesce(sum(net_value),0)      as net_revenue,
           coalesce(sum(gross_value),0)    as gross_revenue,
           coalesce(sum(refunded_value),0) as refunded,
           count(*) filter (where gross_value > 0) as paid_count,
           count(*) filter (where gross_value > 0 and coalesce(status,'') = any(array['refunded','chargeback','cancelled','canceled'])) as reverted_count,
           count(*) filter (where gross_value > 0 and role = 'principal') as paid_principal,
           count(*) filter (where gross_value > 0 and role = 'principal' and coalesce(status,'') = any(array['refunded','chargeback','cancelled','canceled'])) as reverted_principal
    from o_scoped
  ),
  byrole as (
    select role, coalesce(sum(net_value),0) as net from o_scoped group by role
  ),
  scoped_visitors as (
    select distinct tp.visitor_id
    from touchpoints tp, cfg
    where tp.project_id = p_project_id
      and cardinality(cfg.tags) > 0
      and exists (select 1 from unnest(cfg.tags) t where tp.utm_campaign ilike '%' || t || '%')
  ),
  e as (
    select count(*) filter (where te.type = 'pageview')          as pageviews,
           count(*) filter (where te.type = 'checkout_iniciado') as checkouts
    from tracking_events te, cfg, bounds b
    where te.project_id = p_project_id
      and te.ts >= b.ts_from and te.ts < b.ts_to
      and (cardinality(cfg.tags) = 0 or te.visitor_id in (select visitor_id from scoped_visitors))
  )
  select json_build_object(
    'period', json_build_object('from', p_from, 'to', p_to),
    'invested', m.invested,
    'net_revenue', o.net_revenue,
    'gross_revenue', o.gross_revenue,
    'refunded', o.refunded,
    'profit', o.net_revenue - m.invested,
    'net_sales', o.paid_count - o.reverted_count,
    'net_sales_principal', o.paid_principal - o.reverted_principal,
    'paid_count', o.paid_count,
    'reverted_count', o.reverted_count,
    'roas', case when m.invested > 0 then round(o.net_revenue / m.invested, 2) end,
    'cac_total', case when (o.paid_count - o.reverted_count) > 0 then round(m.invested / (o.paid_count - o.reverted_count), 2) end,
    'cac_principal', case when (o.paid_principal - o.reverted_principal) > 0 then round(m.invested / (o.paid_principal - o.reverted_principal), 2) end,
    'ticket_medio', case when (o.paid_count - o.reverted_count) > 0 then round(o.net_revenue / (o.paid_count - o.reverted_count), 2) end,
    'refund_rate_count', case when o.paid_count > 0 then round(o.reverted_count::numeric / o.paid_count, 4) else 0 end,
    'refund_rate_value', case when o.gross_revenue > 0 then round(o.refunded / o.gross_revenue, 4) else 0 end,
    'revenue_by_role', (select coalesce(json_object_agg(role, net), '{}'::json) from byrole),
    'pageviews', e.pageviews,
    'checkouts', e.checkouts,
    'meta', json_build_object('impressions', m.impressions, 'clicks', m.clicks, 'link_clicks', m.link_clicks),
    'funnel', json_build_object(
      'connect_rate',  case when m.link_clicks > 0 then round(e.pageviews::numeric / m.link_clicks, 4) end,
      'to_checkout',   case when e.pageviews   > 0 then round(e.checkouts::numeric / e.pageviews, 4) end,
      'checkout_conv', case when e.checkouts   > 0 then round((o.paid_count - o.reverted_count)::numeric / e.checkouts, 4) end,
      'funnel_conv',   case when e.pageviews   > 0 then round((o.paid_count - o.reverted_count)::numeric / e.pageviews, 4) end
    )
  ) from m, o, e;
$function$;

-- ---------------------------------------------------------------- central_timeseries
create function central_timeseries(p_project_id bigint, p_from date, p_to date, p_ad_accounts text[] default null)
returns table(day date, invested numeric, net_revenue numeric, profit numeric, roas numeric)
language sql stable set search_path to 'public' as $function$
  with cfg as (
    select coalesce((select campaign_name_tags from tracking_config where project_id = p_project_id), '{}'::text[]) as tags
  ),
  incl as (
    select case when exists (select 1 from products where included and project_id = p_project_id)
                then array(select product_id from products where included and project_id = p_project_id) end as ids
  ),
  sel_camp as (
    select c.id from campaigns c, cfg
    where c.project_id = p_project_id
      and (cardinality(cfg.tags) = 0
       or exists (select 1 from unnest(cfg.tags) t where c.name ilike '%' || t || '%'))
      and (p_ad_accounts is null or cardinality(p_ad_accounts) = 0
       or c.ad_account_id in (select id from ad_accounts
                              where project_id = p_project_id and meta_account_id = any(p_ad_accounts)))
  ),
  days as (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  ),
  spend_by_day as (
    select mi.date as day, coalesce(sum(mi.spend),0) as invested
    from meta_insights_daily mi
    join ads a    on a.id = mi.ad_id
    join adsets s on s.id = a.adset_id
    join sel_camp c on c.id = s.campaign_id
    where mi.date between p_from and p_to and mi.project_id = p_project_id
    group by mi.date
  ),
  rev_by_day as (
    select (o.order_date at time zone 'America/Sao_Paulo')::date as day,
           coalesce(sum(o.net_value),0) as net_revenue
    from orders o cross join incl
    where o.project_id = p_project_id
      and o.order_date >= (p_from::timestamp at time zone 'America/Sao_Paulo')
      and o.order_date <  ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo')
      and (incl.ids is null or o.product_id = any(incl.ids))
    group by 1
  )
  select d.day,
         coalesce(s.invested,0)    as invested,
         coalesce(r.net_revenue,0) as net_revenue,
         coalesce(r.net_revenue,0) - coalesce(s.invested,0) as profit,
         case when coalesce(s.invested,0) > 0
              then round(coalesce(r.net_revenue,0) / s.invested, 2) end as roas
  from days d
  left join spend_by_day s on s.day = d.day
  left join rev_by_day   r on r.day = d.day
  order by d.day;
$function$;

grant execute on function central_summary(bigint, date, date, text[])    to authenticated;
grant execute on function central_timeseries(bigint, date, date, text[]) to authenticated;
