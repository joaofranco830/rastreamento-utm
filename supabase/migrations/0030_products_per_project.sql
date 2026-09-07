-- =============================================================================
-- 0030_products_per_project.sql — isolamento de `products` por projeto
-- Fonte de verdade: mapa-funcional-rastreamento-utm.md (hierarquia
-- Conta → Usuário → Projeto; tudo isolado dentro do Projeto).
--
-- PROBLEMA: `products` tinha PK global em (product_id). Isso trava o registry
-- de produtos numa única "gaveta" — o mesmo produto não podia existir de forma
-- independente em dois projetos, e a seleção "incluído/papel" era compartilhada.
--
-- CORREÇÃO (aditiva, NÃO-destrutiva — nenhum valor é apagado):
--   (1) troca a PK de (product_id) para (project_id, product_id);
--   (2) auto-popula o registry de CADA projeto a partir dos próprios pedidos
--       (self-healing) — assim que entram vendas, os produtos aparecem para
--       serem incluídos, isolados por projeto.
-- Não há FK apontando para products (elo suave), então a troca de PK é segura.
-- =============================================================================

-- (1) PK composta: mesmo product_id pode viver em projetos diferentes, cada um
--     com seu included/role/name. project_id já é NOT NULL (0024b).
alter table products drop constraint if exists products_pkey;
alter table products add primary key (project_id, product_id);

-- (2) Backfill self-healing: registra no registry de cada projeto os produtos
--     que já aparecem nos pedidos daquele projeto. Nome vem do payload cru da
--     Hotmart quando disponível; senão fica null (o webhook preenche depois).
--     on conflict do nothing -> NUNCA mexe em linhas já existentes (preserva
--     included/role/name que o usuário já configurou).
insert into products (project_id, product_id, name)
select
  o.project_id,
  o.product_id,
  max(o.raw_payload -> 'data' -> 'product' ->> 'name')
from orders o
where o.product_id is not null
group by o.project_id, o.product_id
on conflict (project_id, product_id) do nothing;
