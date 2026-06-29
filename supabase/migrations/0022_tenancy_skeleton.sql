-- =============================================================================
-- 0022_tenancy_skeleton.sql — Fase V3-0 (esqueleto de tenancy)
-- Fonte de verdade: arquitetura-rastreamento-utm-v3.md (§5.1 e §15 Fase V3-0).
--
-- ADITIVA: cria as 8 tabelas novas da fundação multi-tenant e semeia o
-- Projeto Padrão (cliente atual "Geografia da Voz"), o perfil OWNER (o dono da
-- agência) e a filiação owner -> Projeto Padrão (papel admin).
--
-- NÃO altera, NÃO apaga e NÃO adiciona coluna em NENHUMA tabela de dados
-- existente (visitors/orders/etc.) — isso é a Fase V3-1 (migration 0023+).
--
-- RLS ligado SEM política (padrão v1/v2: acesso só via service_role pelo
-- servidor). As políticas por filiação entram só na Fase V3-3, depois que a
-- leitura migrar para a sessão do usuário. Idempotente (CREATE ... IF NOT
-- EXISTS + seeds com guarda).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- projects — o "cliente". Fronteira de isolamento de TODOS os dados (PRJ-01/02).
-- -----------------------------------------------------------------------------
create table if not exists projects (
  id         bigint generated always as identity primary key,
  name       text not null,
  niche_tag  text,
  timezone   text not null default 'America/Sao_Paulo',
  currency   text not null default 'BRL',
  status     text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- app_users — perfil do usuário (1:1 com auth.users). is_owner = dono da
-- agência (você), com visão/gestão de TODOS os projetos (USR-03).
-- -----------------------------------------------------------------------------
create table if not exists app_users (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  is_owner   boolean not null default false,
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- project_members — atribuição usuário<->projeto + papel (USR-04 / PRJ-04).
--   admin       : poder total no projeto (todas as ações sensíveis + membros).
--   funcionario : configs não-sensíveis (funil/fontes/integrações/CSV).
--   cliente     : só visualiza os dashboards do projeto.
-- -----------------------------------------------------------------------------
create table if not exists project_members (
  id         bigint generated always as identity primary key,
  project_id bigint not null references projects (id) on delete cascade,
  user_id    uuid   not null references app_users (id) on delete cascade,
  role       text   not null check (role in ('admin', 'funcionario', 'cliente')),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists idx_project_members_user on project_members (user_id);

-- -----------------------------------------------------------------------------
-- project_credentials — COFRE por tenant (INT-04). Guarda SÓ o ciphertext +
-- IV + auth tag (AES-256-GCM). A chave-mestra vive no env da Vercel
-- (CREDENTIALS_MASTER_KEY), NUNCA no banco. Decifra só na sync/webhook.
-- (As credenciais reais entram na Fase V3-2; aqui só a tabela.)
-- -----------------------------------------------------------------------------
create table if not exists project_credentials (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references projects (id) on delete cascade,
  provider    text not null check (provider in ('meta', 'hotmart')),
  kind        text not null check (kind in ('token', 'hottok', 'account_id')),
  ciphertext  bytea not null,
  iv          bytea not null,
  auth_tag    bytea not null,
  key_version integer not null default 1,
  updated_at  timestamptz not null default now(),
  unique (project_id, provider, kind)
);

-- -----------------------------------------------------------------------------
-- project_endpoints — roteamento de webhook por projeto (INT-05). A URL única
-- /api/webhook/hotmart/{endpoint_key} resolve o project_id por esta chave.
-- endpoint_key é aleatória e não-enumerável (mas NÃO é o segredo — o segredo é
-- o Hottok no cofre). (As chaves do Padrão entram na Fase V3-2.)
-- -----------------------------------------------------------------------------
create table if not exists project_endpoints (
  id           bigint generated always as identity primary key,
  project_id   bigint not null references projects (id) on delete cascade,
  provider     text not null default 'hotmart' check (provider in ('hotmart')),
  endpoint_key text not null unique,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- project_pixels — pixel (t.js) por projeto (RAS-01/02). O /collect resolve o
-- project_id pela pixel_key embutida no script servido. (Chave do Padrão: V3-2.)
-- -----------------------------------------------------------------------------
create table if not exists project_pixels (
  id         bigint generated always as identity primary key,
  project_id bigint not null references projects (id) on delete cascade,
  pixel_key  text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- utm_link_sets — tabelas de links UTM salvas e nomeadas (Construtor de UTMs).
-- links: jsonb [{label, kind, params, full_url}]. (Ferramenta: Fase V3-7.)
-- -----------------------------------------------------------------------------
create table if not exists utm_link_sets (
  id         bigint generated always as identity primary key,
  project_id bigint not null references projects (id) on delete cascade,
  name       text not null,
  base_url   text not null,
  links      jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_utm_link_sets_project on utm_link_sets (project_id);

-- -----------------------------------------------------------------------------
-- import_batches — histórico de importações CSV de vendas (INT-07). (Fase V3-6.)
-- -----------------------------------------------------------------------------
create table if not exists import_batches (
  id         bigint generated always as identity primary key,
  project_id bigint not null references projects (id) on delete cascade,
  kind       text not null default 'sales' check (kind in ('sales')),
  filename   text,
  row_count  integer not null default 0,
  created_by uuid references app_users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_import_batches_project on import_batches (project_id);

-- -----------------------------------------------------------------------------
-- Segurança: RLS ON, SEM política (igual à v1/v2). Só o servidor (service_role,
-- que ignora RLS) acessa. As políticas por filiação entram na Fase V3-3.
-- -----------------------------------------------------------------------------
alter table projects            enable row level security;
alter table app_users           enable row level security;
alter table project_members     enable row level security;
alter table project_credentials enable row level security;
alter table project_endpoints   enable row level security;
alter table project_pixels      enable row level security;
alter table utm_link_sets       enable row level security;
alter table import_batches      enable row level security;

-- =============================================================================
-- SEEDS (idempotentes)
-- =============================================================================

-- (1) Projeto Padrão = o cliente atual. Recebe TODO o dado atual no backfill
--     da Fase V3-1. Criado só se ainda não existir (guarda por nome).
insert into projects (name, niche_tag, timezone, currency, status)
select 'Geografia da Voz', null, 'America/Sao_Paulo', 'BRL', 'active'
where not exists (select 1 from projects where name = 'Geografia da Voz');

-- (2) Perfil OWNER (o dono da agência). Resolve o uuid pelo e-mail de login no
--     Supabase Auth. >>> CONFIRMAR o e-mail abaixo ANTES de aplicar <<<
--     Se o e-mail não casar, o SELECT retorna 0 linhas (nada é gravado) — sinal
--     para corrigir e reaplicar. on conflict garante reaplicação segura.
insert into app_users (id, full_name, is_owner, status)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', 'Owner'), true, 'active'
from auth.users u
where lower(u.email) = lower('j.guilherme830@icloud.com')
on conflict (id) do update set is_owner = true, status = 'active';

-- (3) Filiação owner -> Projeto Padrão, papel admin. Deriva do owner já semeado.
insert into project_members (project_id, user_id, role)
select p.id, u.id, 'admin'
from projects p
cross join app_users u
where p.name = 'Geografia da Voz' and u.is_owner
on conflict (project_id, user_id) do nothing;
