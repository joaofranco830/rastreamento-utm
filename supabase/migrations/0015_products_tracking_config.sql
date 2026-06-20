-- =============================================================================
-- 0015_products_tracking_config.sql — Fase V2-0 (config base)
-- Fonte de verdade: arquitetura-rastreamento-utm-v2.md (§5 e §11 Fase V2-0).
--
-- ADITIVA: cria DUAS tabelas novas (products, tracking_config) e semeia os
-- produtos reais já vistos em `orders`. NÃO altera nem apaga nenhum dado
-- existente. RLS ligado SEM política (padrão v1: acesso só via service_role
-- pelo servidor). Sem funções novas nesta fase (nada de search_path a fixar).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- products — registry de produtos da Hotmart (seleção + papel)
--   product_id : id do produto na Hotmart (estável, vem de data.product.id).
--   included   : controla o que entra no dashboard (default false).
--   role       : alimenta o bloco "faturamento por papel" da Tela Central.
-- -----------------------------------------------------------------------------
create table if not exists products (
  product_id text primary key,
  name       text,
  role       text not null default 'other'
               check (role in ('principal', 'order_bump', 'upsell', 'downsell', 'other')),
  included   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- tracking_config — configuração única (single-row: id é sempre 1).
--   campaign_name_tags : tags digitadas pelo usuário. Uma campanha do Meta só
--                        entra nas contas se o NOME contiver alguma destas tags
--                        (match aplicado na camada de leitura, Fases V2-3+).
--   retention_days     : janela de poda dos eventos BRUTOS de navegação. Vendas
--                        (orders) e agregados diários NUNCA são podados. Só será
--                        usada na Fase V2-7 (poda). Aqui apenas guardamos.
-- -----------------------------------------------------------------------------
create table if not exists tracking_config (
  id                 integer primary key default 1 check (id = 1),
  campaign_name_tags text[] not null default '{}',
  retention_days     integer not null default 90 check (retention_days > 0),
  updated_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Segurança: RLS ON, SEM política pública (igual à v1). Só o servidor
-- (service_role, que ignora RLS) lê/escreve. Nada de acesso direto do browser.
-- -----------------------------------------------------------------------------
alter table products        enable row level security;
alter table tracking_config enable row level security;

-- -----------------------------------------------------------------------------
-- Seed idempotente dos produtos reais já vistos em `orders` (nomes extraídos do
-- raw_payload). ON CONFLICT DO NOTHING => reaplicar a migration NÃO sobrescreve
-- as escolhas feitas depois na tela de configuração.
--   * Imersão Geografia da Voz  -> principal,  incluído (funil pago ativo).
--   * Gravação da Imersão       -> order_bump, incluído.
--   * Demais 13                 -> other, NÃO incluídos (ligar pela tela).
-- -----------------------------------------------------------------------------
insert into products (product_id, name, role, included) values
  ('7715052', 'Imersão Geografia da Voz',                  'principal',  true),
  ('7716106', 'Gravação da Imersão Geografia da Voz',       'order_bump', true),
  ('5573174', 'Lovers CLUB (community)',                    'other',      false),
  ('6006803', 'Caminho do Timbre',                          'other',      false),
  ('7876102', 'Sistema de Validação de Criativos',          'other',      false),
  ('7925225', 'Autópsia de Criativos',                      'other',      false),
  ('7628494', 'Guia Movimento é o Remédio',                 'other',      false),
  ('4276450', 'Posturas Descompressivas',                   'other',      false),
  ('7848285', 'Treino Coluna Livre',                        'other',      false),
  ('7008167', 'MÉTODO IAM - I (Inglês Através da Música)',   'other',      false),
  ('3023390', 'Workshop - Leitura de onda',                 'other',      false),
  ('2494461', 'Sensualidade na Prática - Acesso Vitalício',  'other',      false),
  ('3346025', 'Sensualidade na Prática',                    'other',      false),
  ('2338509', 'Autoanálise Sensual - Acesso Vitalício',     'other',      false),
  ('6197551', 'Felina',                                     'other',      false)
on conflict (product_id) do nothing;

-- Linha única de configuração (tags vazias; o usuário digita na tela).
insert into tracking_config (id, campaign_name_tags, retention_days) values
  (1, '{}', 90)
on conflict (id) do nothing;
