-- =============================================================================
-- 0001_init.sql — Schema inicial (Fase 0)
-- Fonte de verdade: arquitetura-rastreamento-utm-v1.md (Seção 6)
--
-- Convenções:
--   * Timestamps em timestamptz (UTC no banco). O fuso do negócio
--     (America/Sao_Paulo) é aplicado na CAMADA DE LEITURA/DASHBOARD, não aqui.
--   * Valores monetários em numeric(14,2).
--   * RLS habilitado em todas as tabelas SEM políticas públicas: o acesso é
--     feito pelo servidor (service_role). Nada de leitura direta do navegador.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funis e hierarquia de anúncios do Meta (espelho)
-- -----------------------------------------------------------------------------
create table funnels (
  id          bigint generated always as identity primary key,
  name        text not null,
  domain      text,
  created_at  timestamptz not null default now()
);

create table ad_accounts (
  id              bigint generated always as identity primary key,
  meta_account_id text not null unique,
  -- token_ref: referência ao segredo (NUNCA o token em si). O token do
  -- System User vive no servidor / secret store, jamais no banco ou no client.
  token_ref       text,
  created_at      timestamptz not null default now()
);

create table campaigns (
  id            bigint generated always as identity primary key,
  ad_account_id bigint not null references ad_accounts(id) on delete cascade,
  meta_id       text not null unique,
  name          text,
  created_at    timestamptz not null default now()
);

create table adsets (
  id          bigint generated always as identity primary key,
  campaign_id bigint not null references campaigns(id) on delete cascade,
  meta_id     text not null unique,
  name        text,
  created_at  timestamptz not null default now()
);

create table ads (
  id         bigint generated always as identity primary key,
  adset_id   bigint not null references adsets(id) on delete cascade,
  meta_id    text not null unique,
  name       text,
  audience   text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Identidade do visitante
-- REGRA DE OURO: visitor_id curto, minúsculo, URL-safe, <= 30 caracteres.
-- O CHECK abaixo torna impossível gravar um UUID padrão (36 chars) ou
-- qualquer coisa com maiúsculas.
-- -----------------------------------------------------------------------------
create table visitors (
  visitor_id   text primary key
                 check (visitor_id ~ '^[a-z0-9_-]{1,30}$'),
  first_touch  timestamptz not null default now(),
  last_touch   timestamptz not null default now(),
  contact_hash text
);

create index idx_visitors_contact_hash on visitors (contact_hash);

-- -----------------------------------------------------------------------------
-- Touchpoints — substrato do last-click E da futura "Jornada do cliente" (v2).
-- Guardamos a sequência ordenada COMPLETA de toques desde já, para não perder
-- dado. Hoje só lemos o último (last-click 7d).
-- -----------------------------------------------------------------------------
create table touchpoints (
  id           bigint generated always as identity primary key,
  visitor_id   text not null references visitors(visitor_id) on delete cascade,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_term     text,
  utm_content  text,
  fbclid       text,
  referrer     text,
  page         text,
  ts           timestamptz not null default now()
);

create index idx_touchpoints_visitor_ts on touchpoints (visitor_id, ts);

-- -----------------------------------------------------------------------------
-- Eventos de rastreio (pageview, checkout_iniciado)
-- -----------------------------------------------------------------------------
create table tracking_events (
  id         bigint generated always as identity primary key,
  visitor_id text not null references visitors(visitor_id) on delete cascade,
  type       text not null check (type in ('pageview', 'checkout_iniciado')),
  funnel_id  bigint references funnels(id) on delete set null,
  url        text,
  ts         timestamptz not null default now()
);

create index idx_tracking_events_visitor_ts on tracking_events (visitor_id, ts);
create index idx_tracking_events_type_ts     on tracking_events (type, ts);

-- -----------------------------------------------------------------------------
-- Pedidos (fonte de verdade = webhook Hotmart)
-- REGRA DE OURO: idempotência por transaction (unique) + tudo líquido.
-- net_value é COLUNA CALCULADA: bruto - estornado. Impossível de violar.
-- -----------------------------------------------------------------------------
create table orders (
  id             bigint generated always as identity primary key,
  transaction    text not null unique,           -- código da transação Hotmart
  visitor_id     text references visitors(visitor_id) on delete set null,
  contact_hash   text,
  gross_value    numeric(14,2) not null default 0,
  refunded_value numeric(14,2) not null default 0,
  net_value      numeric(14,2) generated always as (gross_value - refunded_value) stored,
  status         text,
  -- order_date: data/origem da VENDA ORIGINAL, base da contabilidade por
  -- coorte (restatement). Estornos deduzem desta data, não da data do estorno.
  order_date     timestamptz,
  raw_payload    jsonb,
  created_at     timestamptz not null default now()
);

create index idx_orders_visitor      on orders (visitor_id);
create index idx_orders_contact_hash on orders (contact_hash);
create index idx_orders_order_date   on orders (order_date);

-- -----------------------------------------------------------------------------
-- Histórico de eventos do pedido (append-only): aprovação, estorno, parcial...
-- Permite reprocessar e auditar reembolsos que chegam dias depois.
-- -----------------------------------------------------------------------------
create table order_events (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references orders(id) on delete cascade,
  type        text not null,   -- approved/refunded/chargeback/partially_refunded/cancelled...
  value       numeric(14,2),
  raw_payload jsonb,
  ts          timestamptz not null default now()
);

create index idx_order_events_order on order_events (order_id, ts);

-- -----------------------------------------------------------------------------
-- Insights diários do Meta (cache da nossa base; dashboard NUNCA lê o Meta vivo)
-- REGRA DE OURO: unique (ad_id, date) -> re-sync faz upsert, não duplica.
-- -----------------------------------------------------------------------------
create table meta_insights_daily (
  id          bigint generated always as identity primary key,
  ad_id       bigint not null references ads(id) on delete cascade,
  date        date not null,
  spend       numeric(14,2) not null default 0,
  impressions bigint not null default 0,
  clicks      bigint not null default 0,
  link_clicks bigint not null default 0,
  lpv         bigint not null default 0,   -- landing page views (Meta)
  ic          bigint not null default 0,   -- initiate checkout (Meta)
  purchases   bigint not null default 0,   -- compras contadas pelo Meta
  synced_at   timestamptz not null default now(),
  unique (ad_id, date)
);

create index idx_meta_insights_date on meta_insights_daily (date);

-- -----------------------------------------------------------------------------
-- Atribuição clique -> venda (last-click 7d). Reembolso herda esta atribuição.
-- -----------------------------------------------------------------------------
create table attributions (
  id         bigint generated always as identity primary key,
  order_id   bigint not null unique references orders(id) on delete cascade,
  ad_id      bigint references ads(id) on delete set null,   -- nulo = orgânico/sem ad
  origin     text,                                           -- classificação livre (orgânico, referrer...)
  model      text not null default 'last_click_7d',
  match_type text not null check (match_type in ('deterministic', 'fallback')),
  created_at timestamptz not null default now()
);

create index idx_attributions_ad on attributions (ad_id);

-- =============================================================================
-- NOTA: dashboard_rollup (view/materializada de leitura rápida) será criada na
-- Fase 5, pois depende das fórmulas de métricas. Fora do escopo da Fase 0.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Segurança: RLS ON em tudo, SEM políticas públicas.
-- Efeito: anon/authenticated NÃO acessam direto; só o servidor (service_role,
-- que ignora RLS). Acesso ao banco sempre via backend.
-- -----------------------------------------------------------------------------
alter table funnels             enable row level security;
alter table ad_accounts         enable row level security;
alter table campaigns           enable row level security;
alter table adsets              enable row level security;
alter table ads                 enable row level security;
alter table visitors            enable row level security;
alter table touchpoints         enable row level security;
alter table tracking_events     enable row level security;
alter table orders              enable row level security;
alter table order_events        enable row level security;
alter table meta_insights_daily enable row level security;
alter table attributions        enable row level security;
