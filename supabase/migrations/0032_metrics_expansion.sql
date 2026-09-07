-- =============================================================================
-- 0032_metrics_expansion.sql — base de dados para o Construtor de Métricas
--
-- Objetivo (Leva A da feature "métricas personalizadas"): expor TODOS os dados
-- crus (átomos) que o usuário poderá combinar numa fórmula, com nomes amigáveis
-- na aplicação. Duas frentes:
--
--   (1) meta_insights_daily ganha colunas ADITIVAS de criativo/conversão:
--       - leads      (Leads captados)      -> action `lead`
--       - follows    (Seguidores)          -> action `follow`
--       - video_p25/50/100 (reproduções a 25/50/100%)
--       Histórico fica 0 até um re-sync do período (nada destrutivo).
--
--   (2) central_summary passa a devolver:
--       - TODOS os átomos do Meta (lpv, ic, purchases, leads, follows, vídeo)
--         dentro do objeto `meta` (antes só impressions/clicks/link_clicks);
--       - `sales_by_role` (nº de vendas líquidas por etapa, além do faturamento);
--       - `by_product` (faturamento + nº de vendas por PRODUTO individual — para
--         separar, p.ex., 2 upsells diferentes, o que o "por etapa" agrega).
--
-- ADITIVO: recria só central_summary (mesma assinatura de 4 args). Ninguém que
-- já chama some campo; só ganha campos novos. central_timeseries fica intacto.
-- =============================================================================

-- (1) colunas novas em meta_insights_daily -----------------------------------
alter table meta_insights_daily
  add column if not exists leads      bigint not null default 0,  -- action `lead`
  add column if not exists follows    bigint not null default 0,  -- action `follow` (seguidores)
  add column if not exists video_p25  bigint not null default 0,  -- reproduções 25%
  add column if not exists video_p50  bigint not null default 0,  -- reproduções 50%
  add column if not exists video_p100 bigint not null default 0;  -- reproduções 100%

-- (2) central_summary: expõe todos os átomos + vendas por etapa + por produto --
drop function if exists central_summary(bigint, date, date, text[]);

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
           coalesce(sum(mi.link_clicks),0) as link_clicks,
           coalesce(sum(mi.lpv),0)         as lpv,
           coalesce(sum(mi.ic),0)          as ic,
           coalesce(sum(mi.purchases),0)   as purchases,
           coalesce(sum(mi.leads),0)       as leads,
           coalesce(sum(mi.follows),0)     as follows,
           coalesce(sum(mi.video_3s),0)    as video_3s,
           coalesce(sum(mi.video_plays),0) as video_plays,
           coalesce(sum(mi.video_p25),0)   as video_p25,
           coalesce(sum(mi.video_p50),0)   as video_p50,
           coalesce(sum(mi.video_p75),0)   as video_p75,
           coalesce(sum(mi.video_p95),0)   as video_p95,
           coalesce(sum(mi.video_p100),0)  as video_p100
    from meta_insights_daily mi
    join ads a    on a.id = mi.ad_id
    join adsets s on s.id = a.adset_id
    join sel_camp c on c.id = s.campaign_id
    where mi.date between p_from and p_to and mi.project_id = p_project_id
  ),
  o_scoped as (
    select o.net_value, o.gross_value, o.refunded_value, o.status,
           o.product_id,
           coalesce(p.name, o.product_id) as pname,
           coalesce(p.role, 'other')      as role
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
    select role,
           coalesce(sum(net_value),0) as net,
           count(*) filter (where gross_value > 0)
             - count(*) filter (where gross_value > 0 and coalesce(status,'') = any(array['refunded','chargeback','cancelled','canceled'])) as sales
    from o_scoped group by role
  ),
  byprod as (
    select product_id,
           max(pname) as name,
           max(role)  as role,
           coalesce(sum(net_value),0) as net,
           count(*) filter (where gross_value > 0)
             - count(*) filter (where gross_value > 0 and coalesce(status,'') = any(array['refunded','chargeback','cancelled','canceled'])) as sales
    from o_scoped
    where product_id is not null
    group by product_id
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
    'sales_by_role',   (select coalesce(json_object_agg(role, sales), '{}'::json) from byrole),
    'by_product', (select coalesce(json_agg(json_build_object(
                      'product_id', product_id, 'name', name, 'role', role,
                      'net_revenue', net, 'net_sales', sales
                    ) order by net desc), '[]'::json) from byprod),
    'pageviews', e.pageviews,
    'checkouts', e.checkouts,
    'meta', json_build_object(
      'impressions', m.impressions, 'clicks', m.clicks, 'link_clicks', m.link_clicks,
      'lpv', m.lpv, 'ic', m.ic, 'purchases', m.purchases, 'leads', m.leads, 'follows', m.follows,
      'video_3s', m.video_3s, 'video_plays', m.video_plays,
      'video_p25', m.video_p25, 'video_p50', m.video_p50, 'video_p75', m.video_p75,
      'video_p95', m.video_p95, 'video_p100', m.video_p100
    ),
    'funnel', json_build_object(
      'connect_rate',  case when m.link_clicks > 0 then round(e.pageviews::numeric / m.link_clicks, 4) end,
      'to_checkout',   case when e.pageviews   > 0 then round(e.checkouts::numeric / e.pageviews, 4) end,
      'checkout_conv', case when e.checkouts   > 0 then round((o.paid_count - o.reverted_count)::numeric / e.checkouts, 4) end,
      'funnel_conv',   case when e.pageviews   > 0 then round((o.paid_count - o.reverted_count)::numeric / e.pageviews, 4) end
    )
  ) from m, o, e;
$function$;

grant execute on function central_summary(bigint, date, date, text[]) to authenticated;
