-- =============================================================================
-- 0046_vturb_utm_robustness.sql — alinha a leitura de UTM ao modelo do VTurb.
--
-- Modelo do VTurb no checkout Hotmart (confirmado na doc oficial):
--   * xcod → chave de conversão do VTurb (FRONT). Formato v3_<uuid>_<hex>_<n>_...
--            NÃO contém UTMs; é o identificador para casar a sessão do vídeo com
--            a venda (usado na futura integração via API do VTurb).
--   * sck  → rastreio de UPSELL do VTurb (e/ou fbclid/fbp). NÃO são UTMs.
--   * src  → fica LIVRE → é onde as UTMs viajam (UTMify/manual), empacotadas em
--            "|" na ordem source|campaign|medium|content|term|id.
--
-- Portanto inline_origin_json lê UTMs de (1) chaves separadas em origin/tracking
-- (caso a plataforma passe utm_* soltos no futuro) e (2) do src empacotado —
-- e NUNCA de xcod/sck, que pertencem ao VTurb e ficam intactos. Assim os dois
-- sistemas convivem sem um atrapalhar o outro. Não altera dados existentes
-- (as UTMs já vinham do src); apenas deixa a leitura mais robusta e correta.
-- =============================================================================

create or replace function inline_origin_json(p_raw jsonb)
returns jsonb language sql immutable set search_path to 'public' as $function$
  with s as (
    select p_raw->'data'->'purchase'->'origin'   as origin,
           p_raw->'data'->'purchase'->'tracking'  as tracking
  ),
  direct as (
    select jsonb_strip_nulls(jsonb_build_object(
      'utm_source',   coalesce(origin->>'utm_source',   tracking->>'utm_source'),
      'utm_campaign', coalesce(origin->>'utm_campaign', tracking->>'utm_campaign'),
      'utm_medium',   coalesce(origin->>'utm_medium',   tracking->>'utm_medium'),
      'utm_content',  coalesce(origin->>'utm_content',  tracking->>'utm_content'),
      'utm_term',     coalesce(origin->>'utm_term',     tracking->>'utm_term'),
      'utm_id',       coalesce(origin->>'utm_id',       tracking->>'utm_id')
    )) as u
    from s
  ),
  cand as (
    select coalesce(
      (select case when u ? 'utm_source' then u end from direct),
      parse_src_utms((select origin->>'src' from s))
    ) as u
  )
  select case when u is null then null else
    u || jsonb_build_object('class', case
      when (u->>'utm_medium') ~* 'pago|paid|cpc|ppc|meta'
        or (u->>'utm_source') ~* 'facebook|instagram|meta|(^|[^a-z])fb([^a-z]|$)|(^|[^a-z])ig([^a-z]|$)' then 'paid_meta'
      when (u->>'utm_medium') ~* 'organic|org[aâ]nico|bio' or (u->>'utm_content') ~* 'bio' then 'organic'
      else 'other_utm'
    end)
  end
  from cand;
$function$;
