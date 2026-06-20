-- =============================================================================
-- 0016_v2_signals_buyer.sql — Fase V2-1 (captura ampliada + comprador)
-- Fonte de verdade: arquitetura-rastreamento-utm-v2.md (§5 e §11 Fase V2-1).
--
-- ADITIVA: só adiciona colunas (nuláveis) em visitors e orders. Não altera
-- funções, não mexe em dado existente, não cria FK rígida (product_id é elo
-- lógico — uma venda nunca pode falhar por produto não cadastrado).
-- PII (comprador) fica CRUA mas server-only: orders já tem RLS sem política.
-- =============================================================================

-- Sinais do visitante (ADR-v2-4): IP/geo (por header no servidor), device/UA,
-- e cookies do Meta fbp/fbc (lidos no t.js quando o pixel existe na página).
alter table visitors
  add column if not exists ip          text,
  add column if not exists geo_country text,
  add column if not exists geo_region  text,
  add column if not exists geo_city    text,
  add column if not exists user_agent  text,
  add column if not exists device_type text,
  add column if not exists fbp         text,
  add column if not exists fbc         text;

-- Produto + comprador na venda (ADR-v2-3). product_id = data.product.id (Hotmart).
alter table orders
  add column if not exists product_id     text,
  add column if not exists buyer_email    text,
  add column if not exists buyer_name     text,
  add column if not exists buyer_phone    text,
  add column if not exists buyer_document text,
  add column if not exists buyer_address  jsonb;

create index if not exists idx_orders_product_id  on orders (product_id);
create index if not exists idx_orders_buyer_email on orders (buyer_email);
