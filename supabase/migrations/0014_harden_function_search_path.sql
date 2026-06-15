-- =============================================================================
-- 0014_harden_function_search_path.sql — Fase 6 (segurança)
-- Fixa search_path = public nas funções (advisor function_search_path_mutable).
-- Todas usam só tabelas em public + built-ins (pg_catalog, implícito) — seguro.
-- =============================================================================
alter function public.classify_origin(text, text, text, text)            set search_path = public;
alter function public.build_origin_json(public.touchpoints, text)         set search_path = public;
alter function public.attribute_order(bigint)                            set search_path = public;
alter function public.resolve_attribution_ads()                          set search_path = public;
alter function public.recompute_order_totals(bigint)                     set search_path = public;
alter function public.apply_hotmart_event(text, text, text, numeric, text, text, text, numeric, timestamptz, text, jsonb)
                                                                          set search_path = public;
alter function public.acquire_meta_sync_lock(integer)                    set search_path = public;
alter function public.release_meta_sync_lock(text, text)                 set search_path = public;
alter function public.dashboard_summary(date, date)                      set search_path = public;
alter function public.dashboard_by_campaign(date, date)                  set search_path = public;
alter function public.dashboard_by_creative(date, date)                  set search_path = public;
