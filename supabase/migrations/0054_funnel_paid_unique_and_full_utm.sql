-- =============================================================================
-- 0054_funnel_paid_unique_and_full_utm.sql
--
-- Duas mudanças de consistência do dashboard/campanhas:
--
-- (A) ATRIBUIÇÃO POR TRILHA UTM COMPLETA (campanha→conjunto→anúncio) na aba
--     Campanhas, sem NENHUMA dependência de "campanha ativa":
--     - resolve_attribution_ads: removido o desempate por effective_status
--       ('ACTIVE'). A campanha do clique (utm_campaign) é o que manda — funciona
--       com a campanha ativa OU pausada. (ERR-001, ver docs/erros-catalogados.md)
--     - campaigns_table: o fallback de ad (quando a atribuição ainda não linkou)
--       também desambigua pela trilha (content DENTRO da campanha/conjunto do
--       clique), nunca só pelo nome do anúncio. Puxar venda por anúncio
--       independente da campanha continua SÓ na aba Criativos (creatives_consolidated).
--
-- (B) MÉTRICAS DE FUNIL = SÓ TRÁFEGO PAGO + VISITANTES ÚNICOS:
--     page views e checkouts passam a contar VISITANTES ÚNICOS cujo ÚLTIMO
--     clique (last-touchpoint) veio de uma campanha do Meta (tráfego pago).
--     Antes contava cada evento (recarga/etapas) e incluía orgânico. Vale no
--     dashboard (central_summary) e na aba Campanhas (campaigns_table).
--     O pixel continua gravando TUDO (pago+orgânico, cada evento) — o recorte
--     "pago + único" é só na apresentação da métrica.
-- =============================================================================

-- (A) resolve_attribution_ads — sem desempate por status; content é o único
--     filtro duro; utm_campaign e utm_term entram como preferência.
create or replace function public.resolve_attribution_ads()
 returns integer language plpgsql set search_path to 'public'
as $function$
declare v_count integer;
begin
  with cand as (
    select a.id as att_id, a.project_id, a.ad_id,
      (a.origin::jsonb ->> 'utm_content')  as c_content,
      (a.origin::jsonb ->> 'utm_campaign') as c_camp,
      (a.origin::jsonb ->> 'utm_term')     as c_term
    from attributions a
    where (a.origin::jsonb ->> 'utm_content') is not null
      and (
        a.ad_id is null
        or exists (
          select 1 from ads ad0
          join adsets s0 on s0.id = ad0.adset_id
          join campaigns c0 on c0.id = s0.campaign_id
          where ad0.id = a.ad_id
            and (a.origin::jsonb ->> 'utm_campaign') is not null
            and lower(trim(a.origin::jsonb ->> 'utm_campaign')) <> lower(trim(c0.name))
        )
      )
  ),
  pick as (
    select cand.att_id, (
      select ad.id
      from ads ad
      join adsets s    on s.id = ad.adset_id
      join campaigns c on c.id = s.campaign_id
      where ad.project_id = cand.project_id
        and ( cand.c_content = ad.meta_id or lower(trim(cand.c_content)) = lower(trim(ad.name)) )
      order by
        (case when cand.c_content = ad.meta_id then 0 else 1 end),
        (case when cand.c_camp is not null and lower(trim(cand.c_camp)) = lower(trim(c.name)) then 0 else 1 end),
        (case when cand.c_term is not null and cand.c_term = s.meta_id then 0 else 1 end),
        ad.id desc
      limit 1
    ) as new_ad_id
    from cand
  )
  update attributions a set ad_id = pick.new_ad_id
  from pick
  where a.id = pick.att_id and pick.new_ad_id is not null and pick.new_ad_id is distinct from a.ad_id;
  get diagnostics v_count = row_count;
  return v_count;
end
$function$;

-- (A)+(B) campaigns_table — trilha UTM completa nas vendas + funil pago/único.
create or replace function public.campaigns_table(
  p_project_id bigint, p_level text, p_parent_ids text[], p_product_ids text[],
  p_from date, p_to date, p_limit integer default 20
)
 returns table(meta_id text, name text, effective_status text, spend numeric, impressions bigint,
   link_clicks bigint, leads bigint, follows bigint, video_3s bigint, video_p25 bigint, video_p50 bigint,
   video_p75 bigint, video_p95 bigint, video_p100 bigint, video_plays bigint, net_revenue numeric,
   rev_principal numeric, refunded_value numeric, refund_count bigint, purchases_total bigint,
   purchases_principal bigint, reverted bigint, paid bigint, unique_customers bigint, pageviews bigint, checkouts bigint)
 language sql stable set search_path to 'public'
as $function$
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
      and (cardinality(cfg.tags) = 0 or exists (select 1 from unnest(cfg.tags) t where c.name ilike '%' || t || '%'))
  ),
  ad_ent as (
    select a.id as ad_id,
      (case p_level when 'campaign' then c.meta_id when 'adset' then s.meta_id else a.meta_id end) as ent_meta,
      (case p_level when 'campaign' then c.name    when 'adset' then s.name    else a.name    end) as ent_name,
      (case p_level when 'campaign' then c.effective_status when 'adset' then s.effective_status else a.effective_status end) as ent_status
    from ads a join adsets s on s.id = a.adset_id join campaigns c on c.id = s.campaign_id
    where c.id in (select id from sel_camp)
      and (p_level = 'campaign' or p_parent_ids is null or cardinality(p_parent_ids) = 0
        or c.meta_id = any(p_parent_ids) or s.meta_id = any(p_parent_ids))
  ),
  ents as (select distinct ent_meta, ent_name, ent_status from ad_ent),
  insights_by_ent as (
    select ae.ent_meta, coalesce(sum(mi.spend),0) as spend, coalesce(sum(mi.impressions),0) as impressions,
      coalesce(sum(mi.link_clicks),0) as link_clicks, coalesce(sum(mi.leads),0) as leads, coalesce(sum(mi.follows),0) as follows,
      coalesce(sum(mi.video_3s),0) as video_3s, coalesce(sum(mi.video_p25),0) as video_p25, coalesce(sum(mi.video_p50),0) as video_p50,
      coalesce(sum(mi.video_p75),0) as video_p75, coalesce(sum(mi.video_p95),0) as video_p95, coalesce(sum(mi.video_p100),0) as video_p100,
      coalesce(sum(mi.video_plays),0) as video_plays
    from meta_insights_daily mi join ad_ent ae on ae.ad_id = mi.ad_id
    where mi.date between p_from and p_to and mi.project_id = p_project_id group by ae.ent_meta
  ),
  oa as (
    select o.net_value, o.gross_value, o.refunded_value, o.status, o.contact_hash,
      (select pr.role from products pr where pr.product_id = o.product_id and pr.project_id = p_project_id) as role,
      coalesce(
        at.ad_id,
        (select a.id from ads a join adsets s on s.id=a.adset_id join campaigns c on c.id=s.campaign_id
         where a.project_id = p_project_id
           and (lower(trim(a.name)) = lower(trim(at.origin::jsonb ->> 'utm_content')) or a.meta_id = (at.origin::jsonb ->> 'utm_content'))
         order by (case when a.meta_id = (at.origin::jsonb ->> 'utm_content') then 0 else 1 end),
                  (case when (at.origin::jsonb ->> 'utm_campaign') is not null and lower(trim(c.name)) = lower(trim(at.origin::jsonb ->> 'utm_campaign')) then 0 else 1 end),
                  (case when (at.origin::jsonb ->> 'utm_term') is not null and (at.origin::jsonb ->> 'utm_term') = s.meta_id then 0 else 1 end),
                  a.id desc limit 1)
      ) as ad_id,
      at.origin::jsonb as origin
    from orders o cross join bounds b
    left join attributions at on at.order_id = o.id
    where o.project_id = p_project_id and o.order_date >= b.ts_from and o.order_date < b.ts_to
      and o.gross_value > 0
      and (p_product_ids is null or cardinality(p_product_ids) = 0 or o.product_id = any(p_product_ids))
  ),
  oe as (
    select net_value, refunded_value, contact_hash, role,
      (coalesce(status,'') = any(array['refunded','chargeback','cancelled','canceled'])) as reverted,
      (case p_level
        when 'campaign' then coalesce(
          (select c.meta_id from campaigns c where c.project_id = p_project_id and lower(trim(c.name)) = lower(trim(oa.origin ->> 'utm_campaign')) limit 1),
          (select c.meta_id from ads a join adsets s on s.id = a.adset_id join campaigns c on c.id = s.campaign_id where a.id = oa.ad_id)
        )
        when 'adset' then coalesce(
          (select s.meta_id from adsets s where s.project_id = p_project_id and s.meta_id = (oa.origin ->> 'utm_term')),
          (select s.meta_id from ads a join adsets s on s.id = a.adset_id where a.id = oa.ad_id)
        )
        else (select a.meta_id from ads a where a.id = oa.ad_id)
      end) as ent_meta
    from oa
  ),
  orders_by_ent as (
    select ent_meta, coalesce(sum(net_value),0) as net_revenue,
      coalesce(sum(net_value) filter (where role = 'principal'),0) as rev_principal,
      coalesce(sum(refunded_value),0) as refunded_value,
      count(*) filter (where reverted) as refund_count,
      count(*) filter (where not reverted) as purchases_total,
      count(*) filter (where not reverted and role = 'principal') as purchases_principal,
      count(*) filter (where reverted) as reverted, count(*) as paid,
      count(distinct contact_hash) filter (where not reverted and contact_hash is not null) as unique_customers
    from oe where ent_meta is not null group by ent_meta
  ),
  lc as (
    select distinct on (tp.visitor_id) tp.visitor_id, tp.utm_campaign, tp.utm_term, tp.utm_content
    from touchpoints tp where tp.project_id = p_project_id
    order by tp.visitor_id, tp.ts desc
  ),
  ent_visitors as (
    select distinct e.ent_meta, lc.visitor_id
    from ents e join lc on (
         (p_level = 'campaign' and lower(trim(lc.utm_campaign)) = lower(trim(e.ent_name)))
      or (p_level = 'adset'    and lc.utm_term = e.ent_meta)
      -- criativo: casa por nome/id do ad E exige que o anúncio esteja na campanha
      -- do último clique (evita a ambiguidade de nome de ad entre campanhas).
      or (p_level = 'creative' and (lower(trim(lc.utm_content)) = lower(trim(e.ent_name)) or lc.utm_content = e.ent_meta)
          and exists (select 1 from ads a2 join adsets s2 on s2.id=a2.adset_id join campaigns c2 on c2.id=s2.campaign_id
                      where a2.meta_id = e.ent_meta and lower(trim(c2.name)) = lower(trim(lc.utm_campaign))))
    )
  ),
  events_by_ent as (
    select ev.ent_meta,
      count(distinct te.visitor_id) filter (where te.type = 'pageview')          as pageviews,
      count(distinct te.visitor_id) filter (where te.type = 'checkout_iniciado') as checkouts
    from ent_visitors ev join tracking_events te on te.visitor_id = ev.visitor_id
    cross join bounds b
    where te.project_id = p_project_id and te.ts >= b.ts_from and te.ts < b.ts_to
    group by ev.ent_meta
  )
  select e.ent_meta, e.ent_name, e.ent_status,
    coalesce(i.spend,0), coalesce(i.impressions,0), coalesce(i.link_clicks,0), coalesce(i.leads,0), coalesce(i.follows,0),
    coalesce(i.video_3s,0), coalesce(i.video_p25,0), coalesce(i.video_p50,0), coalesce(i.video_p75,0), coalesce(i.video_p95,0), coalesce(i.video_p100,0), coalesce(i.video_plays,0),
    coalesce(o.net_revenue,0), coalesce(o.rev_principal,0), coalesce(o.refunded_value,0), coalesce(o.refund_count,0),
    coalesce(o.purchases_total,0), coalesce(o.purchases_principal,0), coalesce(o.reverted,0), coalesce(o.paid,0),
    coalesce(o.unique_customers,0), coalesce(ev.pageviews,0), coalesce(ev.checkouts,0)
  from ents e
  left join insights_by_ent i on i.ent_meta = e.ent_meta
  left join orders_by_ent   o on o.ent_meta = e.ent_meta
  left join events_by_ent   ev on ev.ent_meta = e.ent_meta
  order by coalesce(i.spend,0) desc, coalesce(o.net_revenue,0) desc
  limit greatest(p_limit, 1);
$function$;

-- (B) central_summary — page views/checkouts = visitantes únicos de tráfego pago.
-- Troca em relação ao vigente: scoped_visitors → lc (último touchpoint) + paid_vis
-- (last-click casa com uma campanha selecionada); e.* passa a count(distinct visitor_id).
create or replace function public.central_summary(p_project_id bigint, p_from date, p_to date, p_ad_accounts text[] default null::text[])
 returns json language sql stable set search_path to 'public'
as $function$
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
    select c.id, c.name from campaigns c, cfg
    where c.project_id = p_project_id
      and (cardinality(cfg.tags) = 0 or exists (select 1 from unnest(cfg.tags) t where c.name ilike '%' || t || '%'))
      and (p_ad_accounts is null or cardinality(p_ad_accounts) = 0
       or c.ad_account_id in (select id from ad_accounts where project_id = p_project_id and meta_account_id = any(p_ad_accounts)))
  ),
  m as (
    select coalesce(sum(mi.spend),0) as invested, coalesce(sum(mi.impressions),0) as impressions,
           coalesce(sum(mi.clicks),0) as clicks, coalesce(sum(mi.link_clicks),0) as link_clicks,
           coalesce(sum(mi.lpv),0) as lpv, coalesce(sum(mi.ic),0) as ic, coalesce(sum(mi.purchases),0) as purchases,
           coalesce(sum(mi.leads),0) as leads, coalesce(sum(mi.follows),0) as follows,
           coalesce(sum(mi.video_3s),0) as video_3s, coalesce(sum(mi.video_plays),0) as video_plays,
           coalesce(sum(mi.video_p25),0) as video_p25, coalesce(sum(mi.video_p50),0) as video_p50,
           coalesce(sum(mi.video_p75),0) as video_p75, coalesce(sum(mi.video_p95),0) as video_p95, coalesce(sum(mi.video_p100),0) as video_p100
    from meta_insights_daily mi
    join ads a on a.id = mi.ad_id join adsets s on s.id = a.adset_id join sel_camp c on c.id = s.campaign_id
    where mi.date between p_from and p_to and mi.project_id = p_project_id
  ),
  o_scoped as (
    select o.id, o.net_value, o.gross_value, o.refunded_value, coalesce(o.status,'') as status,
           o.product_id, o.payment_type, o.contact_hash,
           coalesce(p.name, o.product_id) as pname, coalesce(p.role, 'other') as role,
           (coalesce(o.status,'') = any(array['canceled','cancelled'])) as is_canceled,
           (coalesce(o.status,'') = any(array['refunded','chargeback'])) as is_reverted,
           (coalesce(o.status,'') = any(array['billet_printed','printed_billet','expired','waiting_payment','no_funds','overdue','blocked','pre_order','started','delayed'])) as is_unpaid
    from orders o
    left join products p on p.product_id = o.product_id and p.project_id = p_project_id
    cross join incl, bounds b
    where o.project_id = p_project_id and o.order_date >= b.ts_from and o.order_date < b.ts_to
      and (incl.ids is null or o.product_id = any(incl.ids))
  ),
  o as (
    select coalesce(sum(net_value),0) as net_revenue,
           coalesce(sum(gross_value) filter (where gross_value > 0 and not is_canceled),0) as gross_revenue,
           coalesce(sum(refunded_value) filter (where is_reverted),0) as refunded,
           count(*) filter (where gross_value > 0 and not is_canceled) as paid_count,
           count(*) filter (where gross_value > 0 and is_reverted) as reverted_count,
           count(*) filter (where gross_value > 0 and not is_canceled and role = 'principal') as paid_principal,
           count(*) filter (where gross_value > 0 and is_reverted and role = 'principal') as reverted_principal
    from o_scoped
  ),
  refunds as (
    select count(*) filter (where gross_value > 0 and status = 'refunded') as refunded_count,
           coalesce(sum(refunded_value) filter (where status = 'refunded'),0) as refunded_value,
           count(*) filter (where gross_value > 0 and status = 'chargeback') as chargeback_count,
           coalesce(sum(refunded_value) filter (where status = 'chargeback'),0) as chargeback_value
    from o_scoped
  ),
  pp as (
    select coalesce(contact_hash, 'ord:' || id::text) as pkey, product_id, role,
           bool_or(gross_value > 0 and not is_canceled) as bought,
           bool_or(is_canceled) as has_canceled, bool_or(is_unpaid) as has_unpaid,
           bool_or(payment_type = 'PIX') as has_pix,
           bool_or(payment_type = 'PIX' and gross_value > 0 and not is_canceled) as has_pix_paid,
           bool_or(payment_type = 'PIX' and is_unpaid) as has_pix_unpaid,
           max(gross_value) filter (where is_canceled) as canceled_val,
           max(gross_value) filter (where is_unpaid) as unpaid_val
    from o_scoped group by 1, product_id, role
  ),
  lost as (
    select count(*) filter (where has_canceled and not bought) as canceled_count,
           coalesce(sum(canceled_val) filter (where has_canceled and not bought),0) as canceled_value,
           count(*) filter (where has_unpaid and not bought) as unpaid_count,
           coalesce(sum(unpaid_val) filter (where has_unpaid and not bought),0) as unpaid_value,
           count(*) filter (where has_canceled and not bought and role = 'principal') as canceled_front,
           count(*) filter (where has_unpaid and not bought and role = 'principal') as unpaid_front,
           count(*) filter (where has_pix) as pix_total,
           count(*) filter (where has_pix_paid) as pix_paid,
           count(*) filter (where has_pix_unpaid and not bought) as pix_unpaid
    from pp
  ),
  byrole as (
    select role, coalesce(sum(net_value),0) as net,
           count(*) filter (where gross_value > 0 and not is_canceled)
             - count(*) filter (where gross_value > 0 and is_reverted) as sales
    from o_scoped group by role
  ),
  byprod as (
    select product_id, max(pname) as name, max(role) as role, coalesce(sum(net_value),0) as net,
           count(*) filter (where gross_value > 0 and not is_canceled)
             - count(*) filter (where gross_value > 0 and is_reverted) as sales,
           count(*) filter (where gross_value > 0 and not is_canceled) as paid,
           count(*) filter (where gross_value > 0 and is_reverted) as refund_count,
           coalesce(sum(refunded_value) filter (where is_reverted),0) as refunded
    from o_scoped where product_id is not null group by product_id
  ),
  bypay as (
    select coalesce(nullif(payment_type,''),'OUTROS') as ptype, coalesce(sum(net_value),0) as net,
           count(*) filter (where gross_value > 0 and not is_canceled)
             - count(*) filter (where gross_value > 0 and is_reverted) as sales
    from o_scoped group by 1
  ),
  valid_cust as (
    select contact_hash, count(distinct product_id) as nprod
    from o_scoped where gross_value > 0 and contact_hash is not null and not is_canceled and not is_reverted
    group by contact_hash
  ),
  cust as (select count(*) as unique_customers, count(*) filter (where nprod > 1) as multi_customers from valid_cust),
  subs as (
    select count(*) filter (where o2.gross_value > 0 and o2.raw_payload->'data'->'subscription' is not null) as sub_sales,
           count(*) filter (where o2.gross_value > 0 and o2.raw_payload->'data'->'subscription' is not null
                        and coalesce((o2.raw_payload->'data'->'purchase'->>'recurrence_number')::int,1) = 1) as new_subs,
           count(*) filter (where o2.gross_value > 0 and coalesce((o2.raw_payload->'data'->'purchase'->>'recurrence_number')::int,1) >= 2) as renewals
    from orders o2 cross join incl, bounds b
    where o2.project_id = p_project_id and o2.order_date >= b.ts_from and o2.order_date < b.ts_to
      and (incl.ids is null or o2.product_id = any(incl.ids))
  ),
  lc as (
    select distinct on (tp.visitor_id) tp.visitor_id, tp.utm_campaign
    from touchpoints tp where tp.project_id = p_project_id
    order by tp.visitor_id, tp.ts desc
  ),
  paid_vis as (
    select lc.visitor_id from lc join sel_camp c on lower(trim(lc.utm_campaign)) = lower(trim(c.name))
  ),
  e as (
    select count(distinct te.visitor_id) filter (where te.type = 'pageview') as pageviews,
           count(distinct te.visitor_id) filter (where te.type = 'checkout_iniciado') as checkouts
    from tracking_events te, bounds b
    where te.project_id = p_project_id and te.ts >= b.ts_from and te.ts < b.ts_to
      and te.visitor_id in (select visitor_id from paid_vis)
  ),
  eff as (
    select case when e.pageviews > 0 then e.pageviews else m.lpv end as pageviews,
           case when e.checkouts > 0 then e.checkouts else m.ic end as checkouts,
           (e.pageviews > 0) as pv_own, (e.checkouts > 0) as co_own
    from e, m
  )
  select json_build_object(
    'period', json_build_object('from', p_from, 'to', p_to),
    'invested', m.invested, 'net_revenue', o.net_revenue, 'gross_revenue', o.gross_revenue, 'refunded', o.refunded,
    'profit', o.net_revenue - m.invested,
    'net_sales', o.paid_count - o.reverted_count,
    'net_sales_principal', o.paid_principal - o.reverted_principal,
    'paid_count', o.paid_count, 'reverted_count', o.reverted_count,
    'roas', case when m.invested > 0 then round(o.net_revenue / m.invested, 2) end,
    'cac_total', case when (o.paid_count - o.reverted_count) > 0 then round(m.invested / (o.paid_count - o.reverted_count), 2) end,
    'cac_principal', case when (o.paid_principal - o.reverted_principal) > 0 then round(m.invested / (o.paid_principal - o.reverted_principal), 2) end,
    'ticket_medio', case when (o.paid_count - o.reverted_count) > 0 then round(o.net_revenue / (o.paid_count - o.reverted_count), 2) end,
    'refund_rate_count', case when o.paid_count > 0 then round(o.reverted_count::numeric / o.paid_count, 4) else 0 end,
    'refund_rate_value', case when o.gross_revenue > 0 then round(o.refunded / o.gross_revenue, 4) else 0 end,
    'refunds', json_build_object(
      'refunded', json_build_object('count', refunds.refunded_count, 'value', refunds.refunded_value),
      'chargeback', json_build_object('count', refunds.chargeback_count, 'value', refunds.chargeback_value),
      'total', json_build_object('count', refunds.refunded_count + refunds.chargeback_count, 'value', refunds.refunded_value + refunds.chargeback_value)
    ),
    'lost', json_build_object(
      'canceled', json_build_object('count', lost.canceled_count, 'value', lost.canceled_value),
      'unpaid', json_build_object('count', lost.unpaid_count, 'value', lost.unpaid_value),
      'pix_total', lost.pix_total, 'pix_paid', lost.pix_paid, 'pix_unpaid', lost.pix_unpaid,
      'checkout', json_build_object(
        'entered', eff.checkouts, 'bought', o.paid_principal, 'unpaid', lost.unpaid_front, 'canceled', lost.canceled_front,
        'abandoned', greatest(0, eff.checkouts - (o.paid_principal + lost.unpaid_front + lost.canceled_front))
      )
    ),
    'revenue_by_role', (select coalesce(json_object_agg(role, net), '{}'::json) from byrole),
    'sales_by_role', (select coalesce(json_object_agg(role, sales), '{}'::json) from byrole),
    'by_product', (select coalesce(json_agg(json_build_object('product_id', product_id, 'name', name, 'role', role,
                      'net_revenue', net, 'net_sales', sales, 'paid', paid, 'refund_count', refund_count, 'refunded_value', refunded
                    ) order by net desc), '[]'::json) from byprod),
    'by_payment', (select coalesce(json_agg(json_build_object('type', ptype, 'net_revenue', net, 'net_sales', sales) order by net desc), '[]'::json) from bypay),
    'ltv', json_build_object('unique_customers', cust.unique_customers,
      'ticket', case when cust.unique_customers > 0 then round(o.net_revenue / cust.unique_customers, 2) end,
      'repurchase_rate', case when cust.unique_customers > 0 then round(cust.multi_customers::numeric / cust.unique_customers, 4) end,
      'subscriptions', subs.sub_sales, 'new_subscriptions', subs.new_subs, 'renewals', subs.renewals,
      'renewal_rate', case when subs.sub_sales > 0 then round(subs.renewals::numeric / subs.sub_sales, 4) end),
    'pageviews', eff.pageviews, 'checkouts', eff.checkouts,
    'pageviews_source', case when eff.pv_own then 'pixel' else 'meta' end,
    'checkouts_source', case when eff.co_own then 'pixel' else 'meta' end,
    'meta', json_build_object('impressions', m.impressions, 'clicks', m.clicks, 'link_clicks', m.link_clicks,
      'lpv', m.lpv, 'ic', m.ic, 'purchases', m.purchases, 'leads', m.leads, 'follows', m.follows,
      'video_3s', m.video_3s, 'video_plays', m.video_plays, 'video_p25', m.video_p25, 'video_p50', m.video_p50,
      'video_p75', m.video_p75, 'video_p95', m.video_p95, 'video_p100', m.video_p100),
    'funnel', json_build_object(
      'connect_rate', case when m.link_clicks > 0 then round(eff.pageviews::numeric / m.link_clicks, 4) end,
      'to_checkout', case when eff.pageviews > 0 then round(eff.checkouts::numeric / eff.pageviews, 4) end,
      'checkout_conv', case when eff.checkouts > 0 then round((o.paid_principal - o.reverted_principal)::numeric / eff.checkouts, 4) end,
      'funnel_conv', case when eff.pageviews > 0 then round((o.paid_principal - o.reverted_principal)::numeric / eff.pageviews, 4) end)
  ) from m, o, e, eff, refunds, cust, subs, lost;
$function$;
