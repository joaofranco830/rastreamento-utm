-- =============================================================================
-- 0043_product_payment_matrix.sql — cruzamento produto × forma de pagamento.
--
-- RPC dedicada (não mexe em central_summary) que devolve, por (produto, forma
-- de pagamento), o faturamento líquido e o nº de vendas líquido. A UI pivota
-- isso numa matriz (linhas = produtos, colunas = pagamentos) com alternância
-- faturamento × quantidade. Mesmo escopo do dashboard: produtos incluídos +
-- janela no fuso do negócio. Orders não dependem de conta de anúncio, então
-- p_ad_accounts não é usado (mantido só por simetria de assinatura).
-- =============================================================================

drop function if exists central_product_payment(bigint, date, date);

create function central_product_payment(p_project_id bigint, p_from date, p_to date)
returns table(product_id text, name text, role text, payment_type text, net_revenue numeric, net_sales bigint)
language sql stable set search_path to 'public' as $function$
  with incl as (
    select case when exists (select 1 from products where included and project_id = p_project_id)
                then array(select product_id from products where included and project_id = p_project_id) end as ids
  ),
  bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo')    as ts_from,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as ts_to
  )
  select o.product_id,
         coalesce(p.name, o.product_id) as name,
         coalesce(p.role, 'other')      as role,
         coalesce(nullif(o.payment_type, ''), 'OUTROS') as payment_type,
         coalesce(sum(o.net_value), 0)  as net_revenue,
         (count(*) filter (where o.gross_value > 0 and coalesce(o.status,'') <> all(array['canceled','cancelled']))
          - count(*) filter (where o.gross_value > 0 and coalesce(o.status,'') = any(array['refunded','chargeback'])))::bigint as net_sales
  from orders o
  left join products p on p.product_id = o.product_id and p.project_id = p_project_id
  cross join incl, bounds b
  where o.project_id = p_project_id and o.order_date >= b.ts_from and o.order_date < b.ts_to
    and o.product_id is not null
    and (incl.ids is null or o.product_id = any(incl.ids))
  group by o.product_id, coalesce(p.name, o.product_id), coalesce(p.role, 'other'), coalesce(nullif(o.payment_type, ''), 'OUTROS');
$function$;

grant execute on function central_product_payment(bigint, date, date) to authenticated;
