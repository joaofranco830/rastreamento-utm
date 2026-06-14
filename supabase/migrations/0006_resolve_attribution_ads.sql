-- =============================================================================
-- 0006_resolve_attribution_ads.sql — Fase 4 (prep, testável sem o token do Meta)
-- Liga attributions.ad_id ao anúncio do Meta DEPOIS que `ads` for populada (sync).
-- Casa por utm_content -> ads.meta_id (ID, primário) com fallback por nome.
-- Idempotente e re-executável (só preenche ad_id que está NULL).
-- =============================================================================
create or replace function resolve_attribution_ads()
returns integer
language plpgsql as $$
declare
  v_count integer;
begin
  with upd as (
    update attributions a
    set ad_id = ad.id
    from ads ad
    where a.ad_id is null
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
$$;

revoke all on function resolve_attribution_ads() from public;
revoke execute on function resolve_attribution_ads() from anon, authenticated;
