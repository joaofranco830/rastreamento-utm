-- =============================================================================
-- 0047_vturb_credential.sql — fundação da integração VTurb (nível PROJETO).
--
-- Permite guardar a API key do VTurb Analytics no cofre por projeto
-- (provider='vturb', kind='api_key'), cifrada como as demais credenciais. A
-- integração é configurada UMA vez por projeto e vale para todo funil.
--
-- Também expõe vturb_conversion_key(raw): a chave de conversão do VTurb vem no
-- xcod (v3_<uuid>_<video>_...). É o elo que ligará a venda ao dado do VTurb na
-- futura integração via API de Analytics.
-- =============================================================================

alter table project_credentials drop constraint project_credentials_provider_check;
alter table project_credentials add constraint project_credentials_provider_check
  check (provider = any (array['meta','hotmart','vturb']));

alter table project_credentials drop constraint project_credentials_kind_check;
alter table project_credentials add constraint project_credentials_kind_check
  check (kind = any (array['token','hottok','account_id','api_key']));

create or replace function vturb_conversion_key(p_raw jsonb)
returns text language sql immutable set search_path to 'public' as $function$
  select nullif(p_raw->'data'->'purchase'->'origin'->>'xcod', '')
$function$;
