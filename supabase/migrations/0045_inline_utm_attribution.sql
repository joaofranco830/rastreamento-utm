-- =============================================================================
-- 0045_inline_utm_attribution.sql — lê UTMs escritas direto em src/sck/xcod.
--
-- Modelo A (existente): src = visitor_id curto → casa com touchpoint → UTMs.
-- Modelo B (novo): as UTMs vêm escritas DIRETO no campo do checkout, separadas
--   por "|" na ordem source|campaign|medium|content|term|id (ex.: Franco
--   Advertising). Sem visitor_id, o attribute_order não atribuía nada.
--
-- Agora attribute_order, quando não há visitor_id/touchpoint, tenta extrair as
-- UTMs de src → xcod → sck (parse_src_utms / inline_origin_json) e cria a
-- atribuição. resolve_attribution_ads liga ao anúncio por utm_content (nome/
-- meta_id), agora restrito ao MESMO projeto (isolamento). Assim Origem,
-- Campanhas e Clientes passam a mostrar as UTMs/faturamento por campanha desses
-- pedidos. Idempotente; roda no webhook (apply_hotmart_event) e no backfill.
-- =============================================================================

-- Parser: string pipe-delimitada -> jsonb de UTMs. Ignora fbclid/fbp (sck) e
-- UUID/visitor_id. null quando não casa com o formato de UTM.
create or replace function parse_src_utms(p text)
returns jsonb language sql immutable set search_path to 'public' as $function$
  with parts as (select string_to_array(p, '|') as a)
  select case
    when p is null or p = '' then null
    when coalesce(array_length(a,1),0) < 4 then null                 -- poucos campos
    when p ~ 'fb\.\d' then null                                       -- fbclid/fbp (sck)
    when a[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-' then null     -- começa com UUID (sck)
    else jsonb_strip_nulls(jsonb_build_object(
      'utm_source',   nullif(btrim(a[1]),''),
      'utm_campaign', nullif(btrim(a[2]),''),
      'utm_medium',   nullif(btrim(a[3]),''),
      'utm_content',  nullif(btrim(a[4]),''),
      'utm_term',     nullif(btrim(coalesce(a[5],'')),''),
      'utm_id',       nullif(btrim(coalesce(a[6],'')),'')
    ))
  end
  from parts;
$function$;

-- Monta o origin json (com class) a partir das UTMs embutidas em src/xcod/sck.
-- Prioridade: src > xcod > sck. null quando nenhum campo carrega UTMs.
create or replace function inline_origin_json(p_raw jsonb)
returns jsonb language sql immutable set search_path to 'public' as $function$
  with o as (select p_raw->'data'->'purchase'->'origin' as origin),
  cand as (
    select coalesce(
      parse_src_utms(origin->>'src'),
      parse_src_utms(origin->>'xcod'),
      parse_src_utms(origin->>'sck')
    ) as u
    from o
  )
  select case when u is null then null else
    u || jsonb_build_object('class', case
      when (u->>'utm_medium') ~* 'pago|paid|cpc|ppc|meta'
        or (u->>'utm_source') ~* 'facebook|instagram|meta|(^|[^a-z])fb([^a-z]|$)|(^|[^a-z])ig([^a-z]|$)' then 'paid_meta'
      when (u->>'utm_medium') ~* 'organic|org[aâ]nico|bio'
        or (u->>'utm_content') ~* 'bio' then 'organic'
      else 'other_utm'
    end)
  end
  from cand;
$function$;

-- attribute_order com o ramo Modelo B (UTMs embutidas). match_type continua
-- 'deterministic' (leitura direta do pedido — não é probabilístico); model
-- 'inline_utm' distingue nas análises.
create or replace function attribute_order(p_order_id bigint)
returns text language plpgsql set search_path to 'public' as $function$
declare
  v_order  orders%rowtype;
  v_anchor timestamptz;
  v_tp     touchpoints%rowtype;
  v_origin jsonb;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then return 'no_order'; end if;
  v_anchor := coalesce(v_order.order_date, v_order.created_at);

  if v_order.visitor_id is not null then
    select * into v_tp from touchpoints t
    where t.visitor_id = v_order.visitor_id and t.project_id = v_order.project_id
      and t.ts <= v_anchor and t.ts > v_anchor - interval '7 days'
      and (t.utm_source is not null or t.utm_medium is not null
        or t.utm_campaign is not null or t.utm_term is not null
        or t.utm_content is not null or t.fbclid is not null)
    order by t.ts desc, t.id desc limit 1;

    if found then
      v_origin := build_origin_json(v_tp, null);
    else
      select * into v_tp from touchpoints t
      where t.visitor_id = v_order.visitor_id and t.project_id = v_order.project_id
        and t.ts <= v_anchor and t.ts > v_anchor - interval '7 days'
      order by t.ts desc, t.id desc limit 1;
      if found then v_origin := build_origin_json(v_tp, null);
      else v_origin := jsonb_build_object('class', 'direct'); end if;
    end if;

    insert into attributions (order_id, ad_id, origin, model, match_type, project_id)
    values (p_order_id, null, v_origin::text, 'last_click_7d', 'deterministic', v_order.project_id)
    on conflict (order_id) do update set
      ad_id = excluded.ad_id, origin = excluded.origin,
      model = excluded.model, match_type = excluded.match_type;
    return 'deterministic';
  end if;

  -- Modelo B: UTMs escritas direto em src/sck/xcod (sem nosso visitor_id).
  v_origin := inline_origin_json(v_order.raw_payload);
  if v_origin is not null then
    insert into attributions (order_id, ad_id, origin, model, match_type, project_id)
    values (p_order_id, null, v_origin::text, 'inline_utm', 'deterministic', v_order.project_id)
    on conflict (order_id) do update set
      ad_id  = coalesce(attributions.ad_id, excluded.ad_id),
      origin = excluded.origin, model = excluded.model, match_type = excluded.match_type;
    return 'inline';
  end if;

  if v_order.contact_hash is not null then
    select t.* into v_tp from touchpoints t
    join (
      select te.visitor_id, max(te.ts) as last_ic
      from tracking_events te
      join visitors v on v.visitor_id = te.visitor_id
      where te.type = 'checkout_iniciado'
        and te.ts <= v_anchor and te.ts > v_anchor - interval '7 days'
        and v.contact_hash is not null and v.contact_hash = v_order.contact_hash
        and v.project_id = v_order.project_id
      group by te.visitor_id
    ) cv on cv.visitor_id = t.visitor_id
    where t.project_id = v_order.project_id
      and t.ts <= v_anchor and t.ts > v_anchor - interval '7 days'
      and (t.utm_source is not null or t.utm_medium is not null
        or t.utm_campaign is not null or t.utm_term is not null
        or t.utm_content is not null or t.fbclid is not null)
    order by cv.last_ic desc, t.ts desc, t.id desc limit 1;

    if found then
      v_origin := build_origin_json(v_tp, 'contact_fallback');
      insert into attributions (order_id, ad_id, origin, model, match_type, project_id)
      values (p_order_id, null, v_origin::text, 'last_click_7d', 'fallback', v_order.project_id)
      on conflict (order_id) do update set
        ad_id = excluded.ad_id, origin = excluded.origin,
        model = excluded.model, match_type = excluded.match_type;
      return 'fallback';
    end if;
  end if;

  return 'unattributed';
end;
$function$;

-- Liga attribution.ad_id ao anúncio por utm_content (meta_id ou nome), restrito
-- ao MESMO projeto (reforça isolamento entre projetos).
create or replace function resolve_attribution_ads()
returns integer language plpgsql set search_path to 'public' as $function$
declare v_count integer;
begin
  with upd as (
    update attributions a
    set ad_id = ad.id
    from ads ad
    where a.ad_id is null
      and a.project_id = ad.project_id
      and (a.origin::jsonb ->> 'utm_content') is not null
      and (
            (a.origin::jsonb ->> 'utm_content') = ad.meta_id
         or lower(trim(a.origin::jsonb ->> 'utm_content')) = lower(trim(ad.name))
          )
    returning a.id
  )
  select count(*) into v_count from upd;
  return v_count;
end;
$function$;
