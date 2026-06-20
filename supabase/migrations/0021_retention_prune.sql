-- =============================================================================
-- 0021_retention_prune.sql — Fase V2-7 (retenção/poda)
-- Fonte de verdade: arquitetura-rastreamento-utm-v2.md (ADR-v2-6, §6.6, §11).
--
-- Apaga SÓ eventos brutos (tracking_events, touchpoints) mais velhos que
-- tracking_config.retention_days. NUNCA toca em orders, agregados (meta_insights_
-- daily) nem visitors. Cron diário via pg_cron. search_path fixo.
-- A atribuição usa janela de 7d (toques recentes) + snapshot em attributions.origin,
-- então podar toques antigos não afeta vendas nem atribuições já gravadas.
-- =============================================================================

create or replace function prune_raw_events()
returns text
language plpgsql
set search_path = public
as $$
declare
  v_days   int;
  v_cutoff timestamptz;
  v_tp     bigint := 0;
  v_te     bigint := 0;
begin
  select retention_days into v_days from tracking_config where id = 1;
  v_days   := greatest(coalesce(v_days, 90), 1);
  v_cutoff := now() - make_interval(days => v_days);

  with del as (delete from tracking_events where ts < v_cutoff returning 1)
  select count(*) into v_te from del;

  with del as (delete from touchpoints where ts < v_cutoff returning 1)
  select count(*) into v_tp from del;

  return format('cutoff=%s | tracking_events=%s | touchpoints=%s', v_cutoff, v_te, v_tp);
end;
$$;

revoke all on function prune_raw_events() from public;
revoke execute on function prune_raw_events() from anon, authenticated;

-- Cron diário (05:17 UTC). Roda a função direto no banco (sem http).
select cron.unschedule('prune-raw-events')
  where exists (select 1 from cron.job where jobname = 'prune-raw-events');

select cron.schedule('prune-raw-events', '17 5 * * *', $cron$ select public.prune_raw_events() $cron$);
