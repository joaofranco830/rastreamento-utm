-- =============================================================================
-- 0008_meta_sync_lock.sql — Fase 4 (infra): trava de sync do Meta (ADR-2)
-- Lock por LEASE (lease-based) numa linha singleton — robusto p/ serverless com
-- pool de conexões (advisory lock de sessão não serve aqui). Login + cron +
-- timer + refresh nunca rodam dois ao mesmo tempo; lock travado expira sozinho.
-- =============================================================================
create table if not exists meta_sync_state (
  id               boolean primary key default true,  -- singleton (só id=true)
  locked_until     timestamptz,
  last_started_at  timestamptz,
  last_finished_at timestamptz,
  last_status      text,
  last_error       text,
  constraint meta_sync_state_singleton check (id)
);
insert into meta_sync_state (id) values (true) on conflict (id) do nothing;

alter table meta_sync_state enable row level security; -- só service_role acessa

-- Tenta adquirir o lock (lease em segundos). Retorna true se conseguiu.
create or replace function acquire_meta_sync_lock(p_lease_seconds integer default 300)
returns boolean
language plpgsql as $$
declare v_rows integer;
begin
  update meta_sync_state
    set locked_until    = now() + make_interval(secs => p_lease_seconds),
        last_started_at = now(),
        last_status     = 'running'
  where id = true
    and (locked_until is null or locked_until < now());  -- lock livre ou expirado
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- Libera o lock e registra o resultado do sync.
create or replace function release_meta_sync_lock(p_status text default 'ok', p_error text default null)
returns void
language plpgsql as $$
begin
  update meta_sync_state
    set locked_until     = null,
        last_finished_at = now(),
        last_status      = p_status,
        last_error       = p_error
  where id = true;
end;
$$;

revoke all on function acquire_meta_sync_lock(integer) from public;
revoke execute on function acquire_meta_sync_lock(integer) from anon, authenticated;
revoke all on function release_meta_sync_lock(text, text) from public;
revoke execute on function release_meta_sync_lock(text, text) from anon, authenticated;
