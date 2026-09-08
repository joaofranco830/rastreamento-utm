-- =============================================================================
-- 0048_vturb_analytics_tables.sql — armazenamento do Analytics do VSL (VTurb).
--
-- A API do VTurb é agregada (por player/vídeo + período + UTM). Guardamos:
--   * vturb_players: os vídeos (VSLs) da conta (id, nome, duração, pitch).
--   * vturb_daily: stats por dia e por dimensão UTM (utm_campaign/content/…),
--     vindas de /traffic_origin/stats_by_day — views, plays, retenção/engajamento,
--     conversões e receita. É a base da aba VSLs e das colunas de VSL em
--     Campanhas/Criativos (join por utm_campaign/utm_content).
-- RLS por filiação (tenant_read), como as demais tabelas do projeto.
-- =============================================================================

create table if not exists vturb_players (
  project_id       bigint not null,
  player_id        text   not null,
  name             text,
  duration         int    not null default 0,
  pitch_time       int    not null default 0,
  vturb_created_at timestamptz,
  synced_at        timestamptz not null default now(),
  primary key (project_id, player_id)
);
alter table vturb_players enable row level security;
create policy tenant_read on vturb_players for select using (app_can_access(project_id));
grant select on vturb_players to authenticated;

create table if not exists vturb_daily (
  project_id      bigint not null,
  player_id       text   not null,
  date            date   not null,
  dimension       text   not null,
  value           text   not null,
  viewed          int     not null default 0,
  plays           int     not null default 0,
  finished        int     not null default 0,
  clicked         int     not null default 0,
  over_pitch      int     not null default 0,
  engagement_rate numeric not null default 0,
  conversions     int     not null default 0,
  amount_brl      numeric not null default 0,
  amount_usd      numeric not null default 0,
  play_rate       numeric not null default 0,
  conversion_rate numeric not null default 0,
  synced_at       timestamptz not null default now(),
  primary key (project_id, player_id, date, dimension, value)
);
alter table vturb_daily enable row level security;
create policy tenant_read on vturb_daily for select using (app_can_access(project_id));
grant select on vturb_daily to authenticated;

create index if not exists vturb_daily_dim_val on vturb_daily (project_id, dimension, value);
create index if not exists vturb_daily_date on vturb_daily (project_id, date);
