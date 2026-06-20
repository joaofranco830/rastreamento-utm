-- =============================================================================
-- 0020_campaigns_table.sql — Fase V2-6 (camada de dados: Campanhas estilo gerenciador)
-- Fonte de verdade: arquitetura-rastreamento-utm-v2.md (§5, §7, §8.3, §11).
--
-- ADITIVA. Líquido + coorte + fuso SP. Escopo: campanhas por tag + produtos
-- incluídos. As funções retornam AGREGADOS-BASE por entidade; a tela calcula os
-- ratios (ROAS, CPM, CPC, hook rate, retenção, CTR, connect rate, conversões…).
-- search_path fixo; revogadas de anon/authenticated.
--
-- Mapeamento de venda -> entidade (nosso last-click):
--   * anúncio: attributions.ad_id  OU  origin.utm_content -> ads.name
--   * conjunto: anúncio -> adset    OU  origin.utm_term  -> adsets.meta_id
--   * campanha: anúncio -> campaign OU  origin.utm_campaign -> campaigns.name
-- Eventos (funil) atribuídos por dimensão de UTM do touchpoint do visitante.
-- =============================================================================

create or replace function campaigns_table(
  p_level     text,   -- 'campaign' | 'adset' | 'creative'
  p_parent_id text,   -- meta_id do pai (campanha p/ adset; conjunto p/ creative); null no topo
  p_from      date,
  p_to        date
)
returns table (
  meta_id             text,
  name                text,
  effective_status    text,
  spend               numeric,
  net_revenue         numeric,
  purchases_total     bigint,
  purchases_principal bigint,
  reverted            bigint,
  paid                bigint,
  impressions         bigint,
  link_clicks         bigint,
  video_3s            bigint,
  video_p75           bigint,
  video_p95           bigint,
  video_plays         bigint,
  pageviews           bigint,
  checkouts           bigint
)
language sql stable
set search_path = public
as $$
  with cfg as (
    select coalesce((select campaign_name_tags from tracking_config where id = 1), '{}'::text[]) as tags
  ),
  bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo')    as ts_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as ts_to
  ),
  incl as (
    select case when exists (select 1 from products where included)
                then array(select product_id from products where included) end as ids
  ),
  sel_camp as (
    select c.id from campaigns c, cfg
    where cardinality(cfg.tags) = 0
       or exists (select 1 from unnest(cfg.tags) t where c.name ilike '%' || t || '%')
  ),
  -- cada anúncio -> entidade do nível pedido (com escopo de tag + pai)
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
    where mi.date between p_from and p_to
    group by ae.ent_meta
  ),
  -- pedidos do período (coorte, escopo de produto) com o anúncio resolvido
  oa as (
    select o.net_value, o.status,
      (select pr.role from products pr where pr.product_id = o.product_id) as role,
      coalesce(
        at.ad_id,
        (select a.id from ads a where lower(trim(a.name)) = lower(trim(at.origin::jsonb ->> 'utm_content')) limit 1)
      ) as ad_id,
      at.origin::jsonb as origin
    from orders o
    cross join incl
    cross join bounds b
    left join attributions at on at.order_id = o.id
    where o.order_date >= b.ts_from and o.order_date < b.ts_to
      and o.gross_value > 0
      and (incl.ids is null or o.product_id = any(incl.ids))
  ),
  oe as (
    select net_value, role,
      (coalesce(status,'') = any(array['refunded','chargeback','cancelled','canceled'])) as reverted,
      (case p_level
        when 'campaign' then coalesce(
          (select c.meta_id from ads a join adsets s on s.id = a.adset_id join campaigns c on c.id = s.campaign_id where a.id = oa.ad_id),
          (select c.meta_id from campaigns c where lower(trim(c.name)) = lower(trim(oa.origin ->> 'utm_campaign')) limit 1)
        )
        when 'adset' then coalesce(
          (select s.meta_id from ads a join adsets s on s.id = a.adset_id where a.id = oa.ad_id),
          (select s.meta_id from adsets s where s.meta_id = (oa.origin ->> 'utm_term'))
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
  -- visitantes ligados a cada entidade pela UTM do touchpoint (funil por dimensão)
  ent_visitors as (
    select distinct e.ent_meta, tp.visitor_id
    from ents e
    join touchpoints tp on (
         (p_level = 'campaign' and lower(trim(tp.utm_campaign)) = lower(trim(e.ent_name)))
      or (p_level = 'adset'    and tp.utm_term = e.ent_meta)
      or (p_level = 'creative' and (lower(trim(tp.utm_content)) = lower(trim(e.ent_name)) or tp.utm_content = e.ent_meta))
    )
  ),
  events_by_ent as (
    select ev.ent_meta,
      count(*) filter (where te.type = 'pageview')          as pageviews,
      count(*) filter (where te.type = 'checkout_iniciado') as checkouts
    from ent_visitors ev
    join tracking_events te on te.visitor_id = ev.visitor_id
    cross join bounds b
    where te.ts >= b.ts_from and te.ts < b.ts_to
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
$$;

-- ----------------------------------------------------------------------------
-- creatives_consolidated: por NOME de criativo (mesmo anúncio reusado across
-- campanhas vira 1 linha). Mesmos agregados-base.
-- ----------------------------------------------------------------------------
create or replace function creatives_consolidated(p_from date, p_to date)
returns table (
  name                text,
  spend               numeric,
  net_revenue         numeric,
  purchases_total     bigint,
  purchases_principal bigint,
  reverted            bigint,
  paid                bigint,
  impressions         bigint,
  link_clicks         bigint,
  video_3s            bigint,
  video_p75           bigint,
  video_p95           bigint,
  video_plays         bigint
)
language sql stable
set search_path = public
as $$
  with cfg as (
    select coalesce((select campaign_name_tags from tracking_config where id = 1), '{}'::text[]) as tags
  ),
  bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo')    as ts_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as ts_to
  ),
  incl as (
    select case when exists (select 1 from products where included)
                then array(select product_id from products where included) end as ids
  ),
  sel_camp as (
    select c.id from campaigns c, cfg
    where cardinality(cfg.tags) = 0
       or exists (select 1 from unnest(cfg.tags) t where c.name ilike '%' || t || '%')
  ),
  ad_name as ( -- anúncio -> nome do criativo (no escopo de tag)
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
    where mi.date between p_from and p_to
    group by an.cname
  ),
  oa as (
    select o.net_value, o.status,
      (select pr.role from products pr where pr.product_id = o.product_id) as role,
      coalesce(
        (select a.name from ads a where a.id = at.ad_id),
        at.origin::jsonb ->> 'utm_content'
      ) as cname
    from orders o
    cross join incl
    cross join bounds b
    left join attributions at on at.order_id = o.id
    where o.order_date >= b.ts_from and o.order_date < b.ts_to
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
$$;

revoke all on function campaigns_table(text, text, date, date) from public;
revoke all on function creatives_consolidated(date, date)      from public;
revoke execute on function campaigns_table(text, text, date, date) from anon, authenticated;
revoke execute on function creatives_consolidated(date, date)      from anon, authenticated;
