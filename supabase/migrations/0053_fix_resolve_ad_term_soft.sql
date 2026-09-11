-- =============================================================================
-- 0053_fix_resolve_ad_term_soft.sql — correção do 0052.
--
-- No 0052 o resolve_attribution_ads exigia que utm_term = adset.meta_id como
-- FILTRO. Mas o utm_term nem sempre é o id do conjunto (pode ser um texto, ex.
-- "[F] ADVANTAGE+"), então nenhum ad casava e a re-resolução não corrigia nada.
-- Aqui o content vira o ÚNICO filtro duro; utm_campaign e utm_term entram só
-- como PREFERÊNCIA (order by).
-- =============================================================================

create or replace function public.resolve_attribution_ads()
 returns integer
 language plpgsql
 set search_path to 'public'
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
        or exists (  -- ad atual está numa campanha != do utm_campaign do clique
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
        and ( cand.c_content = ad.meta_id
              or lower(trim(cand.c_content)) = lower(trim(ad.name)) )
      order by
        (case when cand.c_content = ad.meta_id then 0 else 1 end),
        (case when cand.c_camp is not null and lower(trim(cand.c_camp)) = lower(trim(c.name)) then 0 else 1 end),
        (case when cand.c_term is not null and cand.c_term = s.meta_id then 0 else 1 end),
        (case when c.effective_status = 'ACTIVE' then 0 else 1 end),
        ad.id desc
      limit 1
    ) as new_ad_id
    from cand
  )
  update attributions a
    set ad_id = pick.new_ad_id
  from pick
  where a.id = pick.att_id
    and pick.new_ad_id is not null
    and pick.new_ad_id is distinct from a.ad_id;
  get diagnostics v_count = row_count;
  return v_count;
end
$function$;
