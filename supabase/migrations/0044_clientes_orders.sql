-- =============================================================================
-- 0044_clientes_orders.sql — lista plana de compras para a aba "Clientes".
--
-- Uma linha por compra real (gross > 0 e não cancelada) do projeto no período,
-- já com produto, forma de pagamento, parcelas, status, telefone e as UTMs da
-- atribuição (attributions.origin). A aba Clientes agrupa isso por e-mail no
-- client e aplica filtros de produto/UTM + busca em memória. SECURITY INVOKER:
-- respeita a RLS por filiação (ADR-v3-4/11). UTMs ficam nulas onde não há
-- rastreio (ex.: projeto sem touchpoints/atribuição).
-- =============================================================================

drop function if exists clientes_orders(bigint, date, date);

create function clientes_orders(p_project_id bigint, p_from date, p_to date)
returns table(
  transaction text, buyer_email text, buyer_name text, buyer_phone text,
  product_id text, product_name text, order_date timestamptz,
  net_value numeric, gross_value numeric, status text, payment_type text, installments int,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text
) language sql stable set search_path to 'public' as $function$
  with bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo')    as ts_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as ts_to
  )
  select o.transaction, o.buyer_email, o.buyer_name, o.buyer_phone,
         o.product_id, coalesce(p.name, o.product_id) as product_name, o.order_date,
         o.net_value, o.gross_value, o.status, o.payment_type,
         coalesce((o.raw_payload->'data'->'purchase'->'payment'->>'installments_number')::int, 1) as installments,
         a.origin->>'utm_source'   as utm_source,
         a.origin->>'utm_medium'   as utm_medium,
         a.origin->>'utm_campaign' as utm_campaign,
         a.origin->>'utm_content'  as utm_content,
         a.origin->>'utm_term'     as utm_term
  from orders o
  cross join bounds b
  left join products p on p.product_id = o.product_id and p.project_id = p_project_id
  left join lateral (
    select at.origin::jsonb as origin from attributions at where at.order_id = o.id limit 1
  ) a on true
  where o.project_id = p_project_id
    and o.order_date >= b.ts_from and o.order_date < b.ts_to
    and o.gross_value > 0 and coalesce(o.status,'') <> all(array['canceled','cancelled'])
  order by o.order_date desc nulls last;
$function$;

grant execute on function clientes_orders(bigint, date, date) to authenticated;
