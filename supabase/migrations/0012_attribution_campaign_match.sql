-- =============================================================================
-- 0012_attribution_campaign_match.sql — ajustes guiados por dados reais
-- 1) classify_origin: reconhece utm_source que CONTÉM instagram/facebook/meta
--    (ex.: "Instagram_Stories") como paid_meta (antes caía em paid_meta_fbclid).
-- 2) dashboard_by_campaign: credita a venda à campanha por ad_id OU pelo NOME da
--    campanha (origin.utm_campaign = campaigns.name) — a convenção real do cliente
--    usa o nome no utm_campaign. Sem isso, vendas reais caíam em "Sem atribuição".
-- =============================================================================

create or replace function classify_origin(
  p_source text, p_medium text, p_fbclid text, p_referrer text
) returns text
language plpgsql immutable as $$
declare
  v_host text;
begin
  if lower(coalesce(p_source, '')) ~ '(facebook|instagram|meta)'
     or lower(coalesce(p_source, '')) in ('fb','ig')
     or lower(coalesce(p_medium, '')) in ('paid','cpc','paidsocial','paid_social','ppc') then
    return 'paid_meta';
  end if;
  if coalesce(p_fbclid, '') <> '' then
    return 'paid_meta_fbclid';
  end if;
  if coalesce(p_source, '') <> '' or coalesce(p_medium, '') <> '' then
    return 'other_utm';
  end if;
  v_host := lower(coalesce(substring(p_referrer from '^[a-z]+://([^/:?#]+)'), ''));
  if v_host = '' then return 'direct'; end if;
  if v_host = 't.co'
     or v_host ~ '(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.com|instagram\.com|facebook\.com|linkedin\.com|youtube\.com)$' then
    return 'organic';
  end if;
  return 'referral';
end;
$$;

create or replace function dashboard_by_campaign(p_from date, p_to date)
returns table (campaign text, invested numeric, net_revenue numeric, net_sales bigint, roas numeric)
language sql stable as $$
  with bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo')    as ts_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as ts_to
  ),
  -- cada pedido pago do período -> campanha resolvida (ad_id OU nome da campanha)
  oc as (
    select o.id, o.net_value, o.status,
      coalesce(
        (select s.campaign_id from ads a join adsets s on s.id = a.adset_id where a.id = at.ad_id),
        (select c.id from campaigns c
           where lower(trim(c.name)) = lower(trim(at.origin::jsonb ->> 'utm_campaign')) limit 1)
      ) as campaign_id
    from orders o
    join bounds b on (o.order_date >= b.ts_from and o.order_date < b.ts_to)
    left join attributions at on at.order_id = o.id
    where o.gross_value > 0
  ),
  spend_by_camp as (
    select c.id as campaign_id, c.name as campaign, coalesce(sum(mi.spend),0) as invested
    from meta_insights_daily mi
    join ads a on a.id = mi.ad_id
    join adsets s on s.id = a.adset_id
    join campaigns c on c.id = s.campaign_id
    where mi.date between p_from and p_to
    group by c.id, c.name
  ),
  rev_by_camp as (
    select campaign_id,
           coalesce(sum(net_value),0) as net_revenue,
           count(*) filter (where coalesce(status,'') <> all(array['refunded','chargeback','cancelled','canceled'])) as net_sales
    from oc where campaign_id is not null
    group by campaign_id
  )
  select campaign, invested, net_revenue, net_sales, roas from (
    select
      coalesce(sc.campaign, c2.name) as campaign,
      coalesce(sc.invested, 0) as invested,
      coalesce(rc.net_revenue, 0) as net_revenue,
      coalesce(rc.net_sales, 0) as net_sales,
      case when coalesce(sc.invested,0) > 0 then round(coalesce(rc.net_revenue,0) / sc.invested, 2) end as roas
    from spend_by_camp sc
    full outer join rev_by_camp rc on rc.campaign_id = sc.campaign_id
    left join campaigns c2 on c2.id = rc.campaign_id

    union all
    select 'Sem atribuição', 0,
           coalesce(sum(net_value),0),
           count(*) filter (where coalesce(status,'') <> all(array['refunded','chargeback','cancelled','canceled'])),
           null::numeric
    from oc where campaign_id is null
    having count(*) > 0
  ) t
  order by invested desc nulls last, net_revenue desc;
$$;

revoke all on function classify_origin(text, text, text, text) from public;
revoke execute on function classify_origin(text, text, text, text) from anon, authenticated;
revoke all on function dashboard_by_campaign(date, date) from public;
revoke execute on function dashboard_by_campaign(date, date) from anon, authenticated;
