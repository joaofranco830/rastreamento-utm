-- =============================================================================
-- 0036_campaigns_manager.sql — Tela Campanhas estilo Gerenciador de Anúncios.
--
-- Reescreve campaigns_table e creatives_consolidated com:
--   * filtro de PRODUTO (p_product_ids) — null/vazio = todos;
--   * múltiplos pais (p_parent_ids text[]) — drill-down por seleção;
--   * métricas novas por entidade: reembolso (valor + nº), faturamento do
--     front vs. demais produtos, clientes únicos (LTV), leads/seguidores e
--     vídeo 25/50/100%. Derivados (ROAS, CPA, receita por clique...) ficam
--     na aplicação.
--
-- ADITIVO: cria as novas assinaturas; as antigas continuam (não referenciadas
-- após o deploy do app). SECURITY INVOKER + grant a authenticated (RLS).
-- =============================================================================

drop function if exists campaigns_table(bigint, text, text[], text[], date, date);

create function campaigns_table(
  p_project_id bigint, p_level text, p_parent_ids text[], p_product_ids text[], p_from date, p_to date
)
returns table(
  meta_id text, name text, effective_status text,
  spend numeric, impressions bigint, link_clicks bigint, leads bigint, follows bigint,
  video_3s bigint, video_p25 bigint, video_p50 bigint, video_p75 bigint, video_p95 bigint, video_p100 bigint, video_plays bigint,
  net_revenue numeric, rev_principal numeric, refunded_value numeric, refund_count bigint,
  purchases_total bigint, purchases_principal bigint, reverted bigint, paid bigint,
  unique_customers bigint, pageviews bigint, checkouts bigint
)
language sql stable set search_path to 'public' as $function$
  with cfg as (
    select coalesce((select campaign_name_tags from tracking_config where project_id = p_project_id), '{}'::text[]) as tags
  ),
  bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo')    as ts_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as ts_to
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
        p_parent_ids is null or cardinality(p_parent_ids) = 0
        or (p_level = 'adset'    and c.meta_id = any(p_parent_ids))
        or (p_level = 'creative' and s.meta_id = any(p_parent_ids))
        or p_level = 'campaign'
      )
  ),
  ents as (select distinct ent_meta, ent_name, ent_status from ad_ent),
  insights_by_ent as (
    select ae.ent_meta,
      coalesce(sum(mi.spend),0)       as spend,
      coalesce(sum(mi.impressions),0) as impressions,
      coalesce(sum(mi.link_clicks),0) as link_clicks,
      coalesce(sum(mi.leads),0)       as leads,
      coalesce(sum(mi.follows),0)     as follows,
      coalesce(sum(mi.video_3s),0)    as video_3s,
      coalesce(sum(mi.video_p25),0)   as video_p25,
      coalesce(sum(mi.video_p50),0)   as video_p50,
      coalesce(sum(mi.video_p75),0)   as video_p75,
      coalesce(sum(mi.video_p95),0)   as video_p95,
      coalesce(sum(mi.video_p100),0)  as video_p100,
      coalesce(sum(mi.video_plays),0) as video_plays
    from meta_insights_daily mi
    join ad_ent ae on ae.ad_id = mi.ad_id
    where mi.date between p_from and p_to and mi.project_id = p_project_id
    group by ae.ent_meta
  ),
  oa as (
    select o.net_value, o.gross_value, o.refunded_value, o.status, o.contact_hash,
      (select pr.role from products pr where pr.product_id = o.product_id and pr.project_id = p_project_id) as role,
      coalesce(
        at.ad_id,
        (select a.id from ads a where a.project_id = p_project_id and lower(trim(a.name)) = lower(trim(at.origin::jsonb ->> 'utm_content')) limit 1)
      ) as ad_id,
      at.origin::jsonb as origin
    from orders o
    cross join bounds b
    left join attributions at on at.order_id = o.id
    where o.project_id = p_project_id
      and o.order_date >= b.ts_from and o.order_date < b.ts_to
      and o.gross_value > 0
      and (p_product_ids is null or cardinality(p_product_ids) = 0 or o.product_id = any(p_product_ids))
  ),
  oe as (
    select net_value, refunded_value, contact_hash, role,
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
      coalesce(sum(net_value),0)                                        as net_revenue,
      coalesce(sum(net_value) filter (where role = 'principal'),0)      as rev_principal,
      coalesce(sum(refunded_value),0)                                   as refunded_value,
      count(*) filter (where reverted)                                  as refund_count,
      count(*) filter (where not reverted)                              as purchases_total,
      count(*) filter (where not reverted and role = 'principal')       as purchases_principal,
      count(*) filter (where reverted)                                  as reverted,
      count(*)                                                          as paid,
      count(distinct contact_hash) filter (where not reverted and contact_hash is not null) as unique_customers
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
    e.ent_meta, e.ent_name, e.ent_status,
    coalesce(i.spend,0), coalesce(i.impressions,0), coalesce(i.link_clicks,0), coalesce(i.leads,0), coalesce(i.follows,0),
    coalesce(i.video_3s,0), coalesce(i.video_p25,0), coalesce(i.video_p50,0), coalesce(i.video_p75,0), coalesce(i.video_p95,0), coalesce(i.video_p100,0), coalesce(i.video_plays,0),
    coalesce(o.net_revenue,0), coalesce(o.rev_principal,0), coalesce(o.refunded_value,0), coalesce(o.refund_count,0),
    coalesce(o.purchases_total,0), coalesce(o.purchases_principal,0), coalesce(o.reverted,0), coalesce(o.paid,0),
    coalesce(o.unique_customers,0), coalesce(ev.pageviews,0), coalesce(ev.checkouts,0)
  from ents e
  left join insights_by_ent i on i.ent_meta = e.ent_meta
  left join orders_by_ent   o on o.ent_meta = e.ent_meta
  left join events_by_ent   ev on ev.ent_meta = e.ent_meta
  order by coalesce(i.spend,0) desc, coalesce(o.net_revenue,0) desc;
$function$;

grant execute on function campaigns_table(bigint, text, text[], text[], date, date) to authenticated;

-- ---------------------------------------------------------------- creatives_consolidated
drop function if exists creatives_consolidated(bigint, text[], date, date);

create function creatives_consolidated(p_project_id bigint, p_product_ids text[], p_from date, p_to date)
returns table(
  name text,
  spend numeric, impressions bigint, link_clicks bigint, leads bigint, follows bigint,
  video_3s bigint, video_p25 bigint, video_p50 bigint, video_p75 bigint, video_p95 bigint, video_p100 bigint, video_plays bigint,
  net_revenue numeric, rev_principal numeric, refunded_value numeric, refund_count bigint,
  purchases_total bigint, purchases_principal bigint, reverted bigint, paid bigint,
  unique_customers bigint, pageviews bigint, checkouts bigint
)
language sql stable set search_path to 'public' as $function$
  with cfg as (
    select coalesce((select campaign_name_tags from tracking_config where project_id = p_project_id), '{}'::text[]) as tags
  ),
  bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo')    as ts_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as ts_to
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
      coalesce(sum(mi.link_clicks),0) as link_clicks, coalesce(sum(mi.leads),0) as leads, coalesce(sum(mi.follows),0) as follows,
      coalesce(sum(mi.video_3s),0) as video_3s, coalesce(sum(mi.video_p25),0) as video_p25, coalesce(sum(mi.video_p50),0) as video_p50,
      coalesce(sum(mi.video_p75),0) as video_p75, coalesce(sum(mi.video_p95),0) as video_p95, coalesce(sum(mi.video_p100),0) as video_p100,
      coalesce(sum(mi.video_plays),0) as video_plays
    from meta_insights_daily mi
    join ad_name an on an.ad_id = mi.ad_id
    where mi.date between p_from and p_to and mi.project_id = p_project_id
    group by an.cname
  ),
  oa as (
    select o.net_value, o.refunded_value, o.status, o.contact_hash,
      (select pr.role from products pr where pr.product_id = o.product_id and pr.project_id = p_project_id) as role,
      coalesce(
        (select a.name from ads a where a.id = at.ad_id),
        at.origin::jsonb ->> 'utm_content'
      ) as cname
    from orders o
    cross join bounds b
    left join attributions at on at.order_id = o.id
    where o.project_id = p_project_id
      and o.order_date >= b.ts_from and o.order_date < b.ts_to
      and o.gross_value > 0
      and (p_product_ids is null or cardinality(p_product_ids) = 0 or o.product_id = any(p_product_ids))
  ),
  orders_by_name as (
    select cname,
      coalesce(sum(net_value),0) as net_revenue,
      coalesce(sum(net_value) filter (where role = 'principal'),0) as rev_principal,
      coalesce(sum(refunded_value),0) as refunded_value,
      count(*) filter (where coalesce(status,'') = any(array['refunded','chargeback','cancelled','canceled'])) as refund_count,
      count(*) filter (where coalesce(status,'') <> all(array['refunded','chargeback','cancelled','canceled'])) as purchases_total,
      count(*) filter (where coalesce(status,'') <> all(array['refunded','chargeback','cancelled','canceled']) and role = 'principal') as purchases_principal,
      count(*) filter (where coalesce(status,'') = any(array['refunded','chargeback','cancelled','canceled'])) as reverted,
      count(*) as paid,
      count(distinct contact_hash) filter (where coalesce(status,'') <> all(array['refunded','chargeback','cancelled','canceled']) and contact_hash is not null) as unique_customers
    from oa where cname is not null group by cname
  ),
  name_visitors as (
    select distinct an.cname, tp.visitor_id
    from (select distinct cname from ad_name) an
    join touchpoints tp on lower(trim(tp.utm_content)) = lower(trim(an.cname))
    where tp.project_id = p_project_id
  ),
  events_by_name as (
    select nv.cname,
      count(*) filter (where te.type = 'pageview')          as pageviews,
      count(*) filter (where te.type = 'checkout_iniciado') as checkouts
    from name_visitors nv
    join tracking_events te on te.visitor_id = nv.visitor_id
    cross join bounds b
    where te.project_id = p_project_id and te.ts >= b.ts_from and te.ts < b.ts_to
    group by nv.cname
  )
  select
    coalesce(i.cname, o.cname) as name,
    coalesce(i.spend,0), coalesce(i.impressions,0), coalesce(i.link_clicks,0), coalesce(i.leads,0), coalesce(i.follows,0),
    coalesce(i.video_3s,0), coalesce(i.video_p25,0), coalesce(i.video_p50,0), coalesce(i.video_p75,0), coalesce(i.video_p95,0), coalesce(i.video_p100,0), coalesce(i.video_plays,0),
    coalesce(o.net_revenue,0), coalesce(o.rev_principal,0), coalesce(o.refunded_value,0), coalesce(o.refund_count,0),
    coalesce(o.purchases_total,0), coalesce(o.purchases_principal,0), coalesce(o.reverted,0), coalesce(o.paid,0),
    coalesce(o.unique_customers,0), coalesce(ev.pageviews,0), coalesce(ev.checkouts,0)
  from insights_by_name i
  full outer join orders_by_name o on o.cname = i.cname
  left join events_by_name ev on ev.cname = coalesce(i.cname, o.cname)
  order by coalesce(i.spend,0) desc, coalesce(o.net_revenue,0) desc;
$function$;

grant execute on function creatives_consolidated(bigint, text[], date, date) to authenticated;
