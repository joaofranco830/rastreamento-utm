-- =============================================================================
-- 0009_meta_sync_cron.sql — agenda o sync do Meta a cada 6h (ADR-2)
-- pg_cron + pg_net chamam POST /api/sync. O SYNC_SECRET fica no Supabase VAULT
-- (segredo 'sync_secret') — NUNCA neste arquivo. Crie-o uma vez, fora do git:
--   select vault.create_secret('<SYNC_SECRET>', 'sync_secret');
-- (A Vercel no plano gratuito limita cron a 1x/dia, por isso usamos o pg_cron.)
-- =============================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('meta-sync-6h')
  where exists (select 1 from cron.job where jobname = 'meta-sync-6h');

select cron.schedule('meta-sync-6h', '0 */6 * * *', $cron$
  select net.http_post(
    url := 'https://rastreamento-utm.vercel.app/api/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_secret')
    ),
    timeout_milliseconds := 60000
  );
$cron$);
