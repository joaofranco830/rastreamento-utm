-- =============================================================================
-- 0025b_credential_helpers.sql — Fase V3-2 (helpers do cofre)
-- Fonte de verdade: arquitetura-rastreamento-utm-v3.md (§7, ADR-v3-7/7a).
--
-- RPCs server-only para gravar/ler credenciais cifradas convertendo base64<->
-- bytea no banco (evita lidar com bytea via PostgREST no app). O app só troca
-- base64 (ciphertext/iv/auth_tag); a chave-mestra nunca passa por aqui — a
-- cifragem/decifragem acontece no Node (lib/crypto). Execução só por
-- service_role; anon/authenticated NUNCA acessam credencial.
-- =============================================================================

create or replace function set_project_credential(
  p_project_id bigint, p_provider text, p_kind text,
  p_ciphertext_b64 text, p_iv_b64 text, p_tag_b64 text, p_key_version int default 1
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into project_credentials (project_id, provider, kind, ciphertext, iv, auth_tag, key_version, updated_at)
  values (
    p_project_id, p_provider, p_kind,
    decode(p_ciphertext_b64, 'base64'), decode(p_iv_b64, 'base64'), decode(p_tag_b64, 'base64'),
    coalesce(p_key_version, 1), now()
  )
  on conflict (project_id, provider, kind) do update set
    ciphertext = excluded.ciphertext, iv = excluded.iv, auth_tag = excluded.auth_tag,
    key_version = excluded.key_version, updated_at = now();
$$;

revoke all on function set_project_credential(bigint, text, text, text, text, text, int) from public, anon, authenticated;
grant execute on function set_project_credential(bigint, text, text, text, text, text, int) to service_role;

create or replace function get_project_credential(p_project_id bigint, p_provider text, p_kind text)
returns table(ciphertext_b64 text, iv_b64 text, auth_tag_b64 text, key_version int)
language sql
stable
security definer
set search_path = public
as $$
  select encode(ciphertext, 'base64'), encode(iv, 'base64'), encode(auth_tag, 'base64'), key_version
  from project_credentials
  where project_id = p_project_id and provider = p_provider and kind = p_kind
  limit 1;
$$;

revoke all on function get_project_credential(bigint, text, text) from public, anon, authenticated;
grant execute on function get_project_credential(bigint, text, text) to service_role;
