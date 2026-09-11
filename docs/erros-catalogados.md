# Erros catalogados (para nunca mais repetir)

Registro de bugs de consistência de dados já corrigidos, com causa raiz e a
regra (invariante) que impede a recorrência. Ler antes de mexer em atribuição,
nos RPCs de dashboard/campanhas ou na leitura de UTMs.

---

## ERR-001 — Venda atribuída à CAMPANHA errada quando o mesmo criativo roda em várias campanhas

**Sintoma (Franco Advertising, set/2026):** só 1 campanha ativa, mas a aba
Campanhas marcava vendas em 2 campanhas PAUSADAS há mais de 1 mês. Hotmart e
VTurb mostravam a campanha correta (a ativa).

**Causa raiz:** o clique traz `utm_campaign` = **nome da campanha** (único e
correto) e `utm_content` = **nome do anúncio** (AMBÍGUO: o mesmo criativo,
copiado para uma campanha nova, existe com o mesmo nome em N campanhas — no caso
real, 7 campanhas). A função `resolve_attribution_ads` casava `utm_content`
apenas pelo nome do ad e escolhia **um ad arbitrário** (às vezes o de uma
campanha pausada). Depois, `campaigns_table` resolvia a campanha a partir desse
`ad_id` errado — em vez de usar o `utm_campaign` do clique.

**Correção (migrations 0052 + 0053):**
1. `resolve_attribution_ads` desambigua o ad: o único filtro DURO é o
   `utm_content` (nome/id do ad); `utm_campaign` (nome da campanha) e `utm_term`
   entram como PREFERÊNCIA no `order by`, junto com "campanha ATIVA" e id mais
   recente. Também **reprocessa** atribuições cujo `ad_id` atual aponta para uma
   campanha diferente do `utm_campaign` do clique (auto-cura a cada sync).
2. `campaigns_table`: a campanha da venda vem PRIMEIRO do `utm_campaign` do
   clique (fonte da verdade, igual Hotmart/VTurb); o conjunto, do `utm_term`; o
   `ad_id` (já corrigido) fica de fallback.

**Invariante (NÃO violar):**
> A **campanha** e o **conjunto** de uma venda são definidos pelo que o CLIQUE
> registrou (`utm_campaign` / `utm_term`), NUNCA inferidos a partir do nome do
> anúncio. Nome de anúncio (`utm_content`) é ambíguo entre campanhas — só serve
> para achar o ad DENTRO da campanha certa, nunca para escolher a campanha.

**Cuidado:** `utm_term` nem sempre é o id do conjunto (pode vir texto, ex.
"[F] ADVANTAGE+"). Por isso ele é só preferência, nunca filtro obrigatório.

---

## De onde vem cada métrica (Meta × nosso pixel × Hotmart)

Regra geral do sistema (ver CLAUDE.md §3):

- **Faturamento, nº de vendas, reembolsos:** SEMPRE do **Hotmart** (nossa base
  `orders`), nunca do Meta.
- **Investido, impressões, cliques, CPM, vídeo (views/retention), leads,
  seguidores:** SEMPRE do **Meta** (`meta_insights_daily`).
- **Page views e checkouts (funil):** do **nosso pixel** (`tracking_events`),
  mas **contados como VISITANTES ÚNICOS de TRÁFEGO PAGO** (ver ERR-002). No
  dashboard há **fallback para o Meta** só quando o pixel está vazio no período
  (`pageviews_source`/`checkouts_source` diz qual foi usado).
- **Atribuição clique→venda:** last-click 7 dias, pelo nosso `visitor_id`
  (Modelo A) ou pelas UTMs cruas em `src`/`sck`/`xcod` (Modelo B).

---

## ERR-002 — Métricas de funil infladas (contavam cada evento e incluíam orgânico)

**Sintoma:** dashboard mostrava page views/checkouts bem acima do real (ex.:
"338 PV / 24 checkouts" quando o real de tráfego era ~218 PV / 16 checkouts).

**Causa:** as métricas de funil contavam **cada evento** do pixel (recarga de
página, etapas do funil) e **todo tráfego** (pago + orgânico + direto).

**Correção (migration 0054):** page views e checkouts no **dashboard**
(`central_summary`) e na **aba Campanhas** (`campaigns_table`) passam a contar
**VISITANTES ÚNICOS** cujo **último clique (last-touchpoint)** veio de uma
**campanha do Meta** (tráfego pago). O pixel continua gravando tudo (pago +
orgânico, cada evento) — o recorte "pago + único" é só na apresentação.

**Invariante:**
> Métrica de funil apresentada (dashboard/campanhas) = **visitante único** de
> **tráfego pago** (last-click numa campanha do Meta). Nunca contar evento
> bruto nem tráfego orgânico nessas telas. **Cliques = sempre `link_clicks`**
> (nunca "cliques (todos)").

> ⚠️ O pixel cru (tabela `tracking_events`) ainda tem TODOS os eventos (pago +
> orgânico, cada recarga) — de propósito. Só a **apresentação** recorta.
