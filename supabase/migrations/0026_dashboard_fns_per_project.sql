-- =============================================================================
-- 0026_dashboard_fns_per_project.sql — Fase V3-3 (leitura por projeto)
-- Fonte de verdade: arquitetura-rastreamento-utm-v3.md (ADR-v3-11, §5.4, §9.5).
--
-- ADITIVA: cria SOBRECARGAS das 7 funções de dashboard com `p_project_id` como
-- 1º argumento. As versões antigas (sem project_id) FICAM (produção atual, via
-- service_role, segue usando até o deploy final). As novas:
--   * escopam TODA tabela por project_id (config/produtos/campanhas/insights/
--     orders/touchpoints/tracking_events) — p/ o Projeto Padrão (tudo id=1) o
--     resultado é IDÊNTICO ao das antigas (gate de regressão após aplicar);
--   * são SECURITY INVOKER (default) + grant a `authenticated` -> a sessão do
--     usuário as chama sob RLS (defesa em profundidade; isolamento no banco).
-- search_path fixo. STABLE. Nada destrutivo.
-- =============================================================================

-- ---------------------------------------------------------------- central_summary
create or replace function central_summary(p_project_id bigint, p_from date, p_to date)
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
create or replace function central_timeseries(p_project_id bigint, p_from date, p_to date)
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

-- ---------------------------------------------------------------- origem_overview
create or replace function origem_overview(p_project_id bigint, p_from date, p_to date)
returns json language sql stable set search_path to 'public' as $function$
  with bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo')    as ts_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as ts_to
  ),
  incl as (
    select case when exists (select 1 from products where included and project_id = p_project_id)
                then array(select product_id from products where included and project_id = p_project_id) end as ids
  ),
  base as (
    select o.net_value, o.status,
           (at.id is not null) as tracked,
           at.origin::jsonb as origin
    from orders o
    left join attributions at on at.order_id = o.id
    cross join incl
    cross join bounds b
    where o.project_id = p_project_id
      and o.order_date >= b.ts_from and o.order_date < b.ts_to
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
$function$;

-- ---------------------------------------------------------------- customers_list
create or replace function customers_list(p_project_id bigint, p_from date, p_to date)
returns table(buyer_email text, buyer_name text, orders bigint, net_revenue numeric, first_order timestamptz, last_order timestamptz, last_class text)
language sql stable set search_path to 'public' as $function$
  with bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo')    as ts_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as ts_to
  ),
  incl as (
    select case when exists (select 1 from products where included and project_id = p_project_id)
                then array(select product_id from products where included and project_id = p_project_id) end as ids
  ),
  base as (
    select o.buyer_email, o.buyer_name, o.net_value, o.order_date,
           at.origin::jsonb ->> 'class' as class
    from orders o
    left join attributions at on at.order_id = o.id
    cross join incl
    cross join bounds b
    where o.project_id = p_project_id
      and o.order_date >= b.ts_from and o.order_date < b.ts_to
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
$function$;

-- ---------------------------------------------------------------- customer_history
create or replace function customer_history(p_project_id bigint, p_buyer_email text)
returns table(transaction text, product_id text, product_name text, order_date timestamptz, net_value numeric, status text, origin_class text, utm_campaign text)
language sql stable set search_path to 'public' as $function$
  select o.transaction, o.product_id, p.name, o.order_date, o.net_value, o.status,
         at.origin::jsonb ->> 'class'        as origin_class,
         at.origin::jsonb ->> 'utm_campaign' as utm_campaign
  from orders o
  left join products p     on p.product_id = o.product_id and p.project_id = p_project_id
  left join attributions at on at.order_id = o.id
  where o.project_id = p_project_id and o.buyer_email = p_buyer_email
  order by o.order_date desc nulls last;
$function$;

-- ---------------------------------------------------------------- creatives_consolidated
create or replace function creatives_consolidated(p_project_id bigint, p_from date, p_to date)
returns table(name text, spend numeric, net_revenue numeric, purchases_total bigint, purchases_principal bigint, reverted bigint, paid bigint, impressions bigint, link_clicks bigint, video_3s bigint, video_p75 bigint, video_p95 bigint, video_plays bigint)
language sql stable set search_path to 'public' as $function$
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
    select c.id from campaigns c, cfg
    where c.project_id = p_project_id
      and (cardinality(cfg.tags) = 0
       or exists (select 1 from unnest(cfg.tags) t where c.name ilike '%' || t || '%'))
  ),
  ad_name as (
    select a.id as ad_id, coalesce(a.name, '(sem nome)') as cname
    from ads a
    join adsets s    on s.id = a.adset_id
    join campaigns c on c.id = s.campaign_id
    where c.id in (select id from sel_camp)
  ),
  insights_by_name as (
    select an.cname,
      coalesce(sum(mi.spend),0) as spend, coalesce(sum(mi.impressions),0) as impressions,
      coalesce(sum(mi.link_clicks),0) as link_clicks,
      coalesce(sum(mi.video_3s),0) as video_3s, coalesce(sum(mi.video_p75),0) as video_p75,
      coalesce(sum(mi.video_p95),0) as video_p95, coalesce(sum(mi.video_plays),0) as video_plays
    from meta_insights_daily mi
    join ad_name an on an.ad_id = mi.ad_id
    where mi.date between p_from and p_to and mi.project_id = p_project_id
    group by an.cname
  ),
  oa as (
    select o.net_value, o.status,
      (select pr.role from products pr where pr.product_id = o.product_id and pr.project_id = p_project_id) as role,
      coalesce(
        (select a.name from ads a where a.id = at.ad_id),
        at.origin::jsonb ->> 'utm_content'
      ) as cname
    from orders o
    cross join incl
    cross join bounds b
    left join attributions at on at.order_id = o.id
    where o.project_id = p_project_id
      and o.order_date >= b.ts_from and o.order_date < b.ts_to
      and o.gross_value > 0
      and (incl.ids is null or o.product_id = any(incl.ids))
  ),
  orders_by_name as (
    select cname,
      coalesce(sum(net_value),0) as net_revenue,
      count(*) filter (where coalesce(status,'') <> all(array['refunded','chargeback','cancelled','canceled'])) as purchases_total,
      count(*) filter (where coalesce(status,'') <> all(array['refunded','chargeback','cancelled','canceled']) and role = 'principal') as purchases_principal,
      count(*) filter (where coalesce(status,'') = any(array['refunded','chargeback','cancelled','canceled'])) as reverted,
      count(*) as paid
    from oa where cname is not null group by cname
  )
  select
    coalesce(i.cname, o.cname) as name,
    coalesce(i.spend,0), coalesce(o.net_revenue,0),
    coalesce(o.purchases_total,0), coalesce(o.purchases_principal,0),
    coalesce(o.reverted,0), coalesce(o.paid,0),
    coalesce(i.impressions,0), coalesce(i.link_clicks,0),
    coalesce(i.video_3s,0), coalesce(i.video_p75,0), coalesce(i.video_p95,0), coalesce(i.video_plays,0)
  from insights_by_name i
  full outer join orders_by_name o on o.cname = i.cname
  order by coalesce(i.spend,0) desc, coalesce(o.net_revenue,0) desc;
$function$;

-- ---------------------------------------------------------------- campaigns_table
create or replace function campaigns_table(p_project_id bigint, p_level text, p_parent_id text, p_from date, p_to date)
returns table(meta_id text, name text, effective_status text, spend numeric, net_revenue numeric, purchases_total bigint, purchases_principal bigint, reverted bigint, paid bigint, impressions bigint, link_clicks bigint, video_3s bigint, video_p75 bigint, video_p95 bigint, video_plays bigint, pageviews bigint, checkouts bigint)
language sql stable set search_path to 'public' as $function$
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
    select c.id from campaigns c, cfg
    where c.project_id = p_project_id
      and (cardinality(cfg.tags) = 0
       or exists (select 1 from unnest(cfg.tags) t where c.name ilike '%' || t || '%'))
  ),
  ad_ent as (
    select a.id as ad_id,
      (case p_level when 'campaign' then c.meta_id          when 'adset' then s.meta_id          else a.meta_id end)          as ent_meta,
      (case p_level when 'campaign' then c.name             when 'adset' then s.name             else a.name end)             as ent_name,
      (case p_level when 'campaign' then c.effective_status when 'adset' then s.effective_status else a.effective_status end) as ent_status
    from ads a
    join adsets s    on s.id = a.adset_id
    join campaigns c on c.id = s.campaign_id
    where c.id in (select id from sel_camp)
      and (
        p_parent_id is null
        or (p_level = 'adset'    and c.meta_id = p_parent_id)
        or (p_level = 'creative' and s.meta_id = p_parent_id)
      )
  ),
  ents as (select distinct ent_meta, ent_name, ent_status from ad_ent),
  insights_by_ent as (
    select ae.ent_meta,
      coalesce(sum(mi.spend),0)       as spend,
      coalesce(sum(mi.impressions),0) as impressions,
      coalesce(sum(mi.link_clicks),0) as link_clicks,
      coalesce(sum(mi.video_3s),0)    as video_3s,
      coalesce(sum(mi.video_p75),0)   as video_p75,
      coalesce(sum(mi.video_p95),0)   as video_p95,
      coalesce(sum(mi.video_plays),0) as video_plays
    from meta_insights_daily mi
    join ad_ent ae on ae.ad_id = mi.ad_id
    where mi.date between p_from and p_to and mi.project_id = p_project_id
    group by ae.ent_meta
  ),
  oa as (
    select o.net_value, o.status,
      (select pr.role from products pr where pr.product_id = o.product_id and pr.project_id = p_project_id) as role,
      coalesce(
        at.ad_id,
        (select a.id from ads a where a.project_id = p_project_id and lower(trim(a.name)) = lower(trim(at.origin::jsonb ->> 'utm_content')) limit 1)
      ) as ad_id,
      at.origin::jsonb as origin
    from orders o
    cross join incl
    cross join bounds b
    left join attributions at on at.order_id = o.id
    where o.project_id = p_project_id
      and o.order_date >= b.ts_from and o.order_date < b.ts_to
      and o.gross_value > 0
      and (incl.ids is null or o.product_id = any(incl.ids))
  ),
  oe as (
    select net_value, role,
      (coalesce(status,'') = any(array['refunded','chargeback','cancelled','canceled'])) as reverted,
      (case p_level
        when 'campaign' then coalesce(
          (select c.meta_id from ads a join adsets s on s.id = a.adset_id join campaigns c on c.id = s.campaign_id where a.id = oa.ad_id),
          (select c.meta_id from campaigns c where c.project_id = p_project_id and lower(trim(c.name)) = lower(trim(oa.origin ->> 'utm_campaign')) limit 1)
        )
        when 'adset' then coalesce(
          (select s.meta_id from ads a join adsets s on s.id = a.adset_id where a.id = oa.ad_id),
          (select s.meta_id from adsets s where s.project_id = p_project_id and s.meta_id = (oa.origin ->> 'utm_term'))
        )
        else (select a.meta_id from ads a where a.id = oa.ad_id)
      end) as ent_meta
    from oa
  ),
  orders_by_ent as (
    select ent_meta,
      coalesce(sum(net_value),0)                    as net_revenue,
      count(*) filter (where not reverted)          as purchases_total,
      count(*) filter (where not reverted and role = 'principal') as purchases_principal,
      count(*) filter (where reverted)              as reverted,
      count(*)                                      as paid
    from oe where ent_meta is not null group by ent_meta
  ),
  ent_visitors as (
    select distinct e.ent_meta, tp.visitor_id
    from ents e
    join touchpoints tp on (
         (p_level = 'campaign' and lower(trim(tp.utm_campaign)) = lower(trim(e.ent_name)))
      or (p_level = 'adset'    and tp.utm_term = e.ent_meta)
      or (p_level = 'creative' and (lower(trim(tp.utm_content)) = lower(trim(e.ent_name)) or tp.utm_content = e.ent_meta))
    )
    where tp.project_id = p_project_id
  ),
  events_by_ent as (
    select ev.ent_meta,
      count(*) filter (where te.type = 'pageview')          as pageviews,
      count(*) filter (where te.type = 'checkout_iniciado') as checkouts
    from ent_visitors ev
    join tracking_events te on te.visitor_id = ev.visitor_id
    cross join bounds b
    where te.project_id = p_project_id
      and te.ts >= b.ts_from and te.ts < b.ts_to
    group by ev.ent_meta
  )
  select
    e.ent_meta as meta_id,
    e.ent_name as name,
    e.ent_status as effective_status,
    coalesce(i.spend,0), coalesce(o.net_revenue,0),
    coalesce(o.purchases_total,0), coalesce(o.purchases_principal,0),
    coalesce(o.reverted,0), coalesce(o.paid,0),
    coalesce(i.impressions,0), coalesce(i.link_clicks,0),
    coalesce(i.video_3s,0), coalesce(i.video_p75,0), coalesce(i.video_p95,0), coalesce(i.video_plays,0),
    coalesce(ev.pageviews,0), coalesce(ev.checkouts,0)
  from ents e
  left join insights_by_ent i on i.ent_meta = e.ent_meta
  left join orders_by_ent   o on o.ent_meta = e.ent_meta
  left join events_by_ent   ev on ev.ent_meta = e.ent_meta
  order by coalesce(i.spend,0) desc, coalesce(o.net_revenue,0) desc;
$function$;

-- Grants: as NOVAS funções são chamadas pela sessão do usuário (authenticated)
-- sob RLS. anon nunca; service_role pode (bypassa RLS, usado na ingestão/admin).
revoke all on function central_summary(bigint, date, date)             from public, anon;
revoke all on function central_timeseries(bigint, date, date)          from public, anon;
revoke all on function origem_overview(bigint, date, date)             from public, anon;
revoke all on function customers_list(bigint, date, date)              from public, anon;
revoke all on function customer_history(bigint, text)                  from public, anon;
revoke all on function creatives_consolidated(bigint, date, date)      from public, anon;
revoke all on function campaigns_table(bigint, text, text, date, date) from public, anon;

grant execute on function central_summary(bigint, date, date)             to authenticated;
grant execute on function central_timeseries(bigint, date, date)          to authenticated;
grant execute on function origem_overview(bigint, date, date)             to authenticated;
grant execute on function customers_list(bigint, date, date)              to authenticated;
grant execute on function customer_history(bigint, text)                  to authenticated;
grant execute on function creatives_consolidated(bigint, date, date)      to authenticated;
grant execute on function campaigns_table(bigint, text, text, date, date) to authenticated;
