# Fase 4 — Design (Meta Ads sync) — PREP

> Pesquisa + especificação geradas autonomamente. NÃO implementado (precisa do token System User do Meta + ad account id). Quando o usuário fornecer, implementar a partir daqui.

---

## A) Meta Marketing API — endpoints e campos

I have everything needed. Here is the complete, concrete specification.

---

# Spec Fase 4 — Sync Meta Ads (Marketing/Graph API)

Versão da API alvo: **v25.0** (lançada 18/02/2026, versão estável atual). Adotar `GRAPH_API_VERSION=v25.0` como constante única em `lib/meta/config.ts`. Base URL: `https://graph.facebook.com/v25.0`.

> Atenção crítica (mudança 2026): em 12/01/2026 a Meta removeu permanentemente as janelas `7d_view` e `28d_view` da Ads Insights API. As janelas que sobrevivem são `1d_view`, `1d_click`, `7d_click`, `28d_click` (+ `1d_engaged_view`). Isso muda a contagem de purchases/IC do Meta — alinhar com a Seção 7 (métricas) e o modelo de atribuição last-click 7d do nosso sistema.

---

## 1. Endpoint de insights por conta, nível ANÚNCIO

```
GET https://graph.facebook.com/v25.0/act_<AD_ACCOUNT_ID>/insights
  ?level=ad
  &fields=ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,actions,action_values,date_start,date_stop
  &time_increment=1
  &time_range={"since":"2026-06-01","until":"2026-06-13"}
  &action_attribution_windows=["1d_view","7d_click"]
  &limit=500
  &access_token=<SYSTEM_USER_TOKEN>
```

- `level=ad` → uma linha por anúncio. O `time_increment=1` quebra por dia → uma linha por (ad, dia), que é exatamente o grão de `meta_insights_daily(ad_id, date)`.
- `act_` é prefixo obrigatório do ad account id.
- `date_start`/`date_stop` na resposta são iguais quando `time_increment=1` → mapeiam para a coluna `date`.
- Implementar como **job assíncrono de insights** (não chamada síncrona) por causa do limite de tempo da serverless da Vercel: ver Seção 4 (job `async`) e ADR-2 (sync roda como job).

---

## 2. Campos exatos e mapeamento para `meta_insights_daily`

Campos escalares (diretos):

| Resposta Meta | Coluna `meta_insights_daily` | Notas |
|---|---|---|
| `spend` | `spend` | string decimal na moeda da conta → `numeric(14,2)` |
| `impressions` | `impressions` | string inteiro → `bigint` |
| `clicks` | `clicks` | clicks(all): inclui likes/comments etc. |
| `inline_link_clicks` | `link_clicks` | **usar `inline_link_clicks`**, não `clicks`. É o "Cliques no link" (saída para o site). O nome de campo correto na API é `inline_link_clicks`; `link_clicks` aparece dentro de `actions[]` como `action_type=link_click`, mas o campo escalar canônico é `inline_link_clicks` |
| `date_start` | `date` | igual a `date_stop` com `time_increment=1` |
| `ad_id` | FK → resolver para `ads.id` via `ads.meta_id` | |

Campos vindos de `actions[]` (lpv, ic, purchases): `actions` é um array de objetos `{ action_type, value, "<janela>": "<valor>" }`. Cada item da janela (ex. `"7d_click": "12"`) aparece apenas se `action_attribution_windows` foi pedido; `value` é o total da janela default da conta. A Meta retorna **múltiplas variantes do mesmo evento** (ex. `omni_purchase`, `offsite_conversion.fb_pixel_purchase`, `onsite_web_purchase`) frequentemente com o mesmo número — **NÃO somar variantes** (dupla contagem). Escolher UMA variante canônica por métrica:

| Coluna | `action_type` canônico a extrair | Fallback |
|---|---|---|
| `lpv` | `landing_page_view` | (único) |
| `ic` | `omni_initiated_checkout` | `offsite_conversion.fb_pixel_initiate_checkout` se omni ausente |
| `purchases` | `omni_purchase` | `offsite_conversion.fb_pixel_purchase` se omni ausente |

Pseudo-extração (helper `extractAction(actions, type, window)`):

```ts
function extractAction(actions: MetaAction[] | undefined, type: string, window = "value"): number {
  const a = actions?.find(x => x.action_type === type);
  if (!a) return 0;
  return Math.round(Number(a[window] ?? a.value ?? 0));
}
// lpv       = extractAction(row.actions, "landing_page_view")
// ic        = extractAction(row.actions, "omni_initiated_checkout")
// purchases = extractAction(row.actions, "omni_purchase")
```

Decisão de janela: pedir `action_attribution_windows=["1d_view","7d_click"]` e ler a chave `"7d_click"` para `purchases`/`ic` (alinha com nosso modelo last-click 7d). Se preferir o "número que a Meta mostra no Ads Manager", usar `value` (janela default da conta). Documentar a escolha numa constante `ATTRIBUTION_WINDOW = "7d_click"`. Persistir SEMPRE a mesma janela para consistência do dashboard.

Upsert idempotente respeitando `UNIQUE(ad_id, date)`:
```sql
insert into meta_insights_daily (ad_id, date, spend, impressions, clicks, link_clicks, lpv, ic, purchases, synced_at)
values (...)
on conflict (ad_id, date) do update set
  spend = excluded.spend, impressions = excluded.impressions, clicks = excluded.clicks,
  link_clicks = excluded.link_clicks, lpv = excluded.lpv, ic = excluded.ic,
  purchases = excluded.purchases, synced_at = now();
```

---

## 3. Hierarquia (campaigns / adsets / ads) e ligação com `attributions`

Espelhar a hierarquia com 3 edges (ou via insights, que já trazem os ids/names — ver nota). Endpoints dedicados (recomendado para nome/estado canônico):

```
GET /v25.0/act_<id>/campaigns?fields=id,name,effective_status&limit=200
GET /v25.0/act_<id>/adsets?fields=id,name,campaign_id,effective_status,targeting&limit=500
GET /v25.0/act_<id>/ads?fields=id,name,adset_id,campaign_id,creative{url_tags}&limit=500
```

Mapeamento para o schema (`meta_id` = `id` da Meta; FK por `meta_id` do pai):
- `campaigns.meta_id = id`, `campaigns.name = name`, FK `ad_account_id`.
- `adsets.meta_id = id`, `adsets.name = name`, FK `campaign_id` resolvido via `campaigns.meta_id = <adset.campaign_id>`.
- `ads.meta_id = id`, `ads.name = name`, FK `adset_id` resolvido via `adsets.meta_id = <ad.adset_id>`. `ads.audience` pode ser derivado do `adset.targeting` (resumo) ou deixado nulo na v1.

Ordem de upsert (respeita FKs): ad_accounts → campaigns → adsets → ads → insights. As linhas de insights `level=ad` já retornam `campaign_id/campaign_name/adset_id/adset_name/ad_id/ad_name`, então na v1 (1 conta) dá para popular toda a hierarquia a partir do próprio insights e dispensar os 3 edges — mas os edges dão `effective_status` (filtrar ativos) e nomes mais frescos. Recomendação: rodar `/ads` (com `creative{url_tags}`) uma vez por sync para hierarquia + url_tags, e `/insights` para métricas.

### Ligação `attributions.origin` → `ad.id`/`ad.name`

A Meta injeta parâmetros dinâmicos no clique via o campo **URL Parameters** no nível do anúncio. Os 8 tokens disponíveis: `{{ad.id}}`, `{{ad.name}}`, `{{adset.id}}`, `{{adset.name}}`, `{{campaign.id}}`, `{{campaign.name}}`, `{{placement}}`, `{{site_source_name}}`. Convenção a padronizar no Ads Manager (campo "Parâmetros de URL", sem `?` inicial):

```
utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.id}}&utm_term={{adset.id}}
```

Decisão de ligação (determinística, robusta): colocar **`{{ad.id}}` em `utm_content`**. Então:
- `attributions.origin` (JSON) → `origin.utm_content` = Meta `ad.id` → casa com `ads.meta_id` → resolve `ads.id`. Ligação por ID é à prova de renomeação; não usar `utm_content={{ad.name}}` como chave primária (nomes mudam/duplicam). Se a conta legada usar `utm_content={{ad.name}}`, ligar por `lower(ads.name)` como `match_type='fallback'`.
- `utm_campaign={{campaign.name}}` é só rótulo legível; não usar como chave.
- A `creative.url_tags` (do edge `/ads`) contém exatamente a string de URL Parameters configurada — útil para validar/auto-detectar qual token está em `utm_content` antes de implementar o matching.

---

## 4. Paginação, time_increment, date_preset vs time_range

- **Paginação (cursors)**: resposta traz `paging.cursors.{before,after}` e, havendo mais páginas, `paging.next` (URL completa, já com `after` e token). Loop: seguir `paging.next` até ausente. Guarda de segurança: limite de páginas + `limit=500`.
```ts
let url = buildInsightsUrl(...);
const rows = [];
while (url) {
  const res = await fetchJson(url);            // já inclui access_token na 1ª; paging.next o carrega
  rows.push(...res.data);
  url = res.paging?.next ?? null;
}
```
- **`time_increment=1`** → quebra diária (1 linha por dia por ad). Sem ele, retorna agregado do período inteiro numa só linha — não serve para `meta_insights_daily`.
- **`time_range={"since","until"}`** (datas absolutas `YYYY-MM-DD`, inclusive) → usar para sync incremental e reprocessamento de janela. Preferir a `date_preset` para controle exato.
- **`date_preset`** (ex. `today`, `yesterday`, `last_7d`, `last_14d`, `last_30d`, `maximum`) → conveniente para botão "refresh" ou backfill inicial (`maximum`), mas não combinar `date_preset` com `time_range` na mesma chamada.
- **Job assíncrono (Vercel)**: para períodos grandes, usar o insights async report para não estourar o timeout serverless:
  ```
  POST /v25.0/act_<id>/insights  (mesmos params)  → retorna { report_run_id }
  GET  /v25.0/<report_run_id>     → { async_status, async_percent_completion }
  GET  /v25.0/<report_run_id>/insights  → resultados paginados quando async_status="Job Completed"
  ```
  Padrão de polling com backoff; persistir `report_run_id` para retomar. Sync incremental diário (janela curta) pode ser síncrono.

---

## 5. Rate limiting + assentamento (settling) → reprocessar janela recente

### Rate limiting (BUC — Business Use Case)
- Header em toda resposta: **`X-Business-Use-Case-Usage`** — JSON keyed por business id, array de objetos com:
  - `type` (ex. `"ads_insights"`), `call_count`, `total_cputime`, `total_time` (todos % de 0–100), `estimated_time_to_regain_access` (minutos), `ads_api_access_tier` (`development_access` | `standard_access`).
- Fórmula `ads_insights` por ad account / hora: `(600 [Dev tier] ou 190000 [Standard tier]) + 400 * anúncios_ativos − 0.001 * user_errors`. (1 conta na v1 → folga grande, mas parsear o header é obrigatório.)
- Códigos de throttling: `code 4` (app volume), `code 17` (user volume), `code 80000` subcode `2446079` (Ads Insights BUC), `code 80004` (Ads Management BUC).
- Política (alinha Seção 5 — retry/backoff/degradation): após cada resposta, ler o header; se `total_time`/`total_cputime`/`call_count ≥ 90`, pausar proativamente. Em erro de throttle, **parar** e aguardar `estimated_time_to_regain_access` minutos (exponential backoff com jitter como fallback). Espaçar chamadas; respeitar o `lock` compartilhado do ADR-2 para não rodar dois syncs concorrentes.

### Assentamento / restatement da janela recente
- Conversões (`actions` purchase/IC) **continuam mudando nos dias seguintes** dentro da janela de atribuição (1d/7d click) — o número de "ontem" não é final. Por isso: **reprocessar uma janela móvel** a cada sync, não só o dia corrente.
  - Recomendação: `LOOKBACK_DAYS = 8` (cobre 7d_click + 1 dia de folga). Cada sync re-busca `time_range` dos últimos 8 dias e faz upsert (o `UNIQUE(ad_id,date)` garante restatement sem duplicar; `synced_at` registra a recência → alimenta o selo "atualizado há X min" do ADR-2).
- Retenção (limites 2026): aggregates/totais até **37 meses**; campos de contagem única / breakdown horário **13 meses**; breakdown de frequência **6 meses**. Backfill inicial: usar `date_preset=maximum` mas não esperar dados além desses limites.

---

## 6. Token System User (server-side)

- Tipo: **System User access token** — não expira (não atrelado a humano), ideal para job 6h/cron e backend always-on. Gerado em Business Settings → System Users → Generate Token, selecionando o app e os escopos.
- Escopo mínimo para leitura de insights/hierarquia: **`ads_read`** (somente leitura; não pedir `ads_management` pois só lemos). `read_insights` é para Pages/IG, não necessário para Ads Insights.
- Uso server-side (alinha ADR-2 / Seção 5 — token só no servidor): token vive em **secret store / env var na Vercel** (`META_SYSTEM_USER_TOKEN`), referenciado por `ad_accounts.token_ref` (apenas a referência, nunca o valor, conforme comentário do schema). Passar como `access_token=` na query ou header `Authorization: Bearer <token>`. Nunca expor ao client; todo fetch da Graph API sai do `lib/supabase/admin.ts`-equivalente server-only (ex. `lib/meta/client.ts`). Em token inválido/revogado (`code 190`), marcar estado degradado e exigir reauth (gerar novo token) — sem fluxo OAuth de usuário.

---

## Resumo de constantes a fixar (para `lib/meta/config.ts`)
```
GRAPH_API_VERSION   = "v25.0"
INSIGHTS_FIELDS     = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,actions,action_values,date_start,date_stop"
ATTRIBUTION_WINDOW  = "7d_click"        // chave lida de actions[]
ATTR_WINDOWS_PARAM  = ["1d_view","7d_click"]
LOOKBACK_DAYS       = 8                 // janela reprocessada por sync (settling)
PAGE_LIMIT          = 500
ACTION_MAP          = { lpv:"landing_page_view", ic:"omni_initiated_checkout", purchases:"omni_purchase" }
UTM_AD_KEY          = "utm_content"     // carrega {{ad.id}} -> ads.meta_id
```

## Pontos de verificação antes de implementar (quando tiver token + ad account id)
1. Fazer 1 chamada real e inspecionar `actions[]` para confirmar quais variantes de purchase/IC a conta retorna (omni vs offsite_conversion) e ajustar `ACTION_MAP`.
2. Ler `creative.url_tags` de 1 ad real para confirmar em qual UTM o `{{ad.id}}` está (validar a convenção da Seção 3).
3. Logar o `X-Business-Use-Case-Usage` e o `ads_api_access_tier` para saber o teto real (Dev vs Standard).

## Fontes
- Insights API (oficial): https://developers.facebook.com/docs/marketing-api/insights/
- Changelog v25.0 (oficial): https://developers.facebook.com/docs/graph-api/changelog/version25.0/
- Rate Limiting (oficial): https://developers.facebook.com/docs/graph-api/overview/rate-limiting/
- System Users — install apps & generate tokens (oficial): https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens/
- adsinsights.py (campos canônicos, SDK oficial): https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adsinsights.py
- Mudança de janelas de atribuição 2026: https://ppc.land/meta-restricts-attribution-windows-and-data-retention-in-ads-insights-api/ e https://seresa.io/blog/attribution-measurement/meta-killed-its-28-day-view-attribution-window-on-january-12-2026
- Deprecação de métricas (actions continua): https://ppc.land/meta-to-deprecate-over-100-unique-metrics-from-ads-insights-api-on-october-30/
- inline_link_clicks vs link_clicks (oficial): https://developers.facebook.com/ads/blog/post/v2/2016/03/16/link-clicks-updates/
- Parâmetros dinâmicos de URL / UTM Meta: https://www.tripledart.com/marketing-tutorials/how-to-add-dynamic-url-parameters-to-meta-ads e https://docs.dreamdata.io/article/yhwh0y22k2-tracking-meta-ads

Arquivos relevantes no projeto:
- Schema: `/Users/joaofranco/Claude Code/Sistema de rastreamento Franco Advertising/supabase/migrations/0001_init.sql`
- Arquitetura (ADR-2, Seções 5 e 7): `/Users/joaofranco/Claude Code/Sistema de rastreamento Franco Advertising/arquitetura-rastreamento-utm-v1.md`

---

## B) Módulo de sync (cadência ADR-2, lock, incremental)

Análise completa. Tenho schema e arquitetura. Vou produzir a especificação do módulo de sync.

mcp__ccd_session__mark_chapter não é necessário aqui — vou direto à entrega.

# ESPECIFICAÇÃO — Módulo de Sync do Meta (Fase 4)

> Status: ESPECIFICAÇÃO, não implementar. Pronto para virar código quando o usuário entregar o token System User + ad account id. Alinhado a ADR-2, Seção 5 e Seção 7. Nada de token no client/banco.

---

## 0. Resumo das decisões (TL;DR)

| Tema | Decisão | Por quê |
|---|---|---|
| Token | Env var server-only `META_SYSTEM_USER_TOKEN`; `ad_accounts.token_ref` guarda o **nome da env** (ex.: `'META_SYSTEM_USER_TOKEN'`), nunca o valor | Seção 5: token só no servidor; schema já tem `token_ref` documentado como "referência ao segredo" |
| Cron 6h | **Vercel Cron** chamando `GET /api/sync/cron` | Mesma stack/deploy do app; o código de sync (SDK Meta, lib admin) já vive no Next; evita duplicar lógica numa Edge Function Supabase em Deno |
| Lock | **`pg_try_advisory_lock`** via RPC server-only + tabela `sync_state` para metadados/freshness | Advisory lock é atômico e auto-libera ao fim da sessão; `sync_state` dá o selo "atualizado há X min" e status de erro/reauth |
| Incremental | Janela móvel últimos **14 dias**, `time_increment=1`, upsert `ON CONFLICT (ad_id,date)` | Reprocessa o assentamento do Meta sem duplicar |
| Hierarquia | Upsert `campaigns`/`adsets`/`ads` por `meta_id` antes dos insights | FK de `meta_insights_daily.ad_id` exige `ads` existir |
| Atribuição pós-sync | **NÃO** rodar attribute_order no sync. Sync só espelha a hierarquia. Ligação `utm_content → ads.meta_id` é responsabilidade do módulo de atribuição (Fase 3) | Separação de domínios (ADR-1). Detalhe na Seção 6 |
| Serverless timeout | Paginar com cursor; `maxDuration` na rota; job desenha-se para caber numa execução (1 conta, ~14 dias → trivial) | Limite Vercel |

---

## 1. Arquivos a criar

```
lib/meta/client.ts          # Wrapper Graph API (fetch + retry/backoff + paginação + classificação de erro)
lib/meta/types.ts           # Tipos: MetaInsightRow, MetaEntity, SyncResult, MetaErrorClass
lib/meta/sync.ts            # Orquestra: lock -> hierarquia -> insights -> upsert -> sync_state
lib/meta/errors.ts          # isTokenExpired(code,subcode), isRateLimit(...), classifyMetaError(...)
lib/meta/config.ts          # GRAPH_VERSION, WINDOW_DAYS=14, campos/fields, env names
app/api/sync/route.ts       # POST on-demand (login, timer 30min, botão refresh) — server-only
app/api/sync/cron/route.ts  # GET chamado pelo Vercel Cron 6h (protegido por CRON_SECRET)
supabase/migrations/0002_sync_state_and_locks.sql  # tabela sync_state + RPCs de lock + upsert insights
vercel.json                 # registra o cron job 6h  (ou bloco "crons" no next.config se preferirem)
```

Reuso: `lib/supabase/admin.ts` (cliente service_role já existe).

---

## 2. Onde fica o token (decisão detalhada)

- Valor do token: **env var server-only** `META_SYSTEM_USER_TOKEN` (Vercel Project Settings → Environment Variables, sem prefixo `NEXT_PUBLIC_`). Nunca chega ao bundle do client.
- `ad_accounts.token_ref` = a **string com o nome da env** (`'META_SYSTEM_USER_TOKEN'`). O sync lê a linha de `ad_accounts`, pega `token_ref`, e faz `process.env[token_ref]`. Isso prepara multi-conta (cada conta aponta sua env) sem nunca persistir segredo.
- `ad_accounts.meta_account_id` = o `act_<id>` (ou só o id; `config.ts` normaliza pra `act_`).
- Env adicionais: `META_GRAPH_VERSION` (default no `config.ts`), `CRON_SECRET` (proteção do endpoint cron).

```ts
// lib/meta/config.ts
export const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? 'v21.0';
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const WINDOW_DAYS = 14;          // janela móvel reprocessada (assentamento Meta)
export const INSIGHT_FIELDS = [
  'ad_id','ad_name','adset_id','adset_name','campaign_id','campaign_name',
  'spend','impressions','clicks','inline_link_clicks','actions','date_start'
] as const;
// LPV/IC/purchases vêm dentro de `actions[]` por action_type — ver client.ts
export const ACTION_MAP = {
  lpv:       'landing_page_view',
  ic:        'initiate_checkout',         // ou 'omni_initiated_checkout'
  purchases: 'purchase',                  // ou 'omni_purchase' — confirmar na conta
} as const;
export function resolveToken(tokenRef: string | null): string {
  const name = tokenRef ?? 'META_SYSTEM_USER_TOKEN';
  const v = process.env[name];
  if (!v) throw new MetaConfigError(`Token env ${name} ausente`);
  return v;
}
```

---

## 3. Cadência ADR-2 — quem dispara o quê

| Gatilho | Mecanismo | Endpoint | Notas |
|---|---|---|---|
| Cron 6h (deslogado) | **Vercel Cron** | `GET /api/sync/cron` | Header `Authorization: Bearer ${CRON_SECRET}` validado; Vercel envia automaticamente |
| Fetch no login | Server Action / client no mount do dashboard | `POST /api/sync` `{trigger:'login'}` | Tela abre com cache na hora; sync em background (fire-and-forget, sem bloquear render) |
| Timer 30min (aba ativa) | Client: `setInterval` + `document.visibilitychange` (pausa quando aba oculta) | `POST /api/sync` `{trigger:'timer'}` | Reusa o interval; só dispara se `document.visibilityState==='visible'` |
| Botão atualizar | Click → POST síncrono com spinner | `POST /api/sync` `{trigger:'manual'}` | Retorna `SyncResult` p/ atualizar selo "há X min" |

**Recomendação de cron: Vercel Cron, não Supabase pg_cron.** Justificativa: a lógica de sync (SDK/HTTP do Meta, retry, parsing de `actions[]`, upsert via `admin.ts`) é TypeScript e já vive no projeto Next. Usar Supabase pg_cron exigiria ou (a) `pg_net`/`http` chamando de volta uma rota Next (mesma chamada HTTP que o Vercel Cron faz, com mais peças móveis), ou (b) reescrever todo o sync numa Edge Function Deno (duplicação). Vercel Cron é uma linha de config e chama a rota direto. Mantém uma fonte de verdade do código de sync. O pg_cron fica reservado pra jobs puramente SQL (ex.: rebuild do `dashboard_rollup`, Fase 5).

```jsonc
// vercel.json
{
  "crons": [
    { "path": "/api/sync/cron", "schedule": "0 */6 * * *" }   // 00:00, 06:00, 12:00, 18:00 UTC
  ]
}
```

> Nota plano Vercel: Hobby permite cron só 1×/dia. Se o projeto estiver no Hobby, o "6h" cai pra 1×/dia OU usa-se um cron externo (cron-job.org/GitHub Actions) batendo no endpoint com `CRON_SECRET`. Pro resolve. Decisão a confirmar com o plano atual — o endpoint é o mesmo nos dois casos.

---

## 4. Lock compartilhado (migration 0002)

Advisory lock no Postgres exposto por RPC server-only (padrão revoke anon/authenticated já adotado). Uma chave fixa por conta. `pg_try_advisory_lock` retorna `false` imediatamente se outro gatilho já está sincronizando → o gatilho concorrente sai limpo (no-op), nunca roda 2× junto.

```sql
-- supabase/migrations/0002_sync_state_and_locks.sql

-- Metadados de freshness/estado por conta (selo "atualizado há X min" + reauth)
create table sync_state (
  ad_account_id   bigint primary key references ad_accounts(id) on delete cascade,
  last_started_at timestamptz,
  last_success_at timestamptz,                       -- base do selo "há X min"
  last_status     text not null default 'idle'
                    check (last_status in ('idle','running','success','error','needs_reauth')),
  last_error      text,
  rows_upserted   int  not null default 0,
  updated_at      timestamptz not null default now()
);
alter table sync_state enable row level security;   -- sem políticas públicas; só service_role

-- Chave de lock determinística por conta (classe 42 arbitrária + id da conta)
-- Lock de SESSÃO: dura enquanto a conexão do request viver; auto-libera ao fechar.
create or replace function meta_sync_try_lock(p_account_id bigint)
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_try_advisory_lock(42, p_account_id::int);
$$;

create or replace function meta_sync_unlock(p_account_id bigint)
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_advisory_unlock(42, p_account_id::int);
$$;

-- Upsert idempotente de insights (ON CONFLICT (ad_id,date)) em lote (jsonb -> rows)
create or replace function upsert_meta_insights(rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  with incoming as (
    select
      (r->>'ad_id')::bigint        as ad_id,
      (r->>'date')::date           as date,
      (r->>'spend')::numeric       as spend,
      (r->>'impressions')::bigint  as impressions,
      (r->>'clicks')::bigint       as clicks,
      (r->>'link_clicks')::bigint  as link_clicks,
      (r->>'lpv')::bigint          as lpv,
      (r->>'ic')::bigint           as ic,
      (r->>'purchases')::bigint    as purchases
    from jsonb_array_elements(rows) as r
  )
  insert into meta_insights_daily
    (ad_id,date,spend,impressions,clicks,link_clicks,lpv,ic,purchases,synced_at)
  select ad_id,date,spend,impressions,clicks,link_clicks,lpv,ic,purchases, now()
  from incoming
  on conflict (ad_id,date) do update set
    spend       = excluded.spend,
    impressions = excluded.impressions,
    clicks      = excluded.clicks,
    link_clicks = excluded.link_clicks,
    lpv         = excluded.lpv,
    ic          = excluded.ic,
    purchases   = excluded.purchases,
    synced_at   = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Segurança: revoke anon/authenticated (padrão do projeto). Só service_role chama.
revoke all on function meta_sync_try_lock(bigint)   from anon, authenticated;
revoke all on function meta_sync_unlock(bigint)      from anon, authenticated;
revoke all on function upsert_meta_insights(jsonb)   from anon, authenticated;
```

> Por que advisory de SESSÃO e não transação: o sync faz I/O de rede (chamadas Meta) entre adquirir o lock e gravar — não cabe numa transação única. Risco: se a função serverless morrer no meio, a sessão Postgres pode demorar a fechar e o lock fica preso. Mitigação: o orquestrador sempre roda `meta_sync_unlock` num `finally`, e `sync_state` carrega um carimbo `last_started_at` + status `running` que o próximo gatilho usa pra detectar lock órfão (se `running` há > N min, força unlock). Alternativa mais robusta: lease via `sync_state` com `lock_expires_at` em vez de advisory — recomendo advisory na v1 (mais simples) e migrar pra lease se aparecer lock órfão na prática.

---

## 5. Orquestração — pseudo-código

```ts
// lib/meta/client.ts
export class MetaClient {
  constructor(private token: string, private accountId: string) {}

  // GET com retry/backoff exponencial + jitter; classifica erro do Meta
  private async graphGet(path: string, params: Record<string,string>, attempt = 0): Promise<any> {
    const url = `${GRAPH_BASE}/${path}?${new URLSearchParams({ ...params, access_token: this.token })}`;
    const res = await fetch(url);
    const body = await res.json();
    if (res.ok) return body;

    const cls = classifyMetaError(body?.error);   // 'rate_limit' | 'token_expired' | 'transient' | 'fatal'
    if (cls === 'token_expired') throw new MetaTokenExpiredError(body.error);
    if ((cls === 'rate_limit' || cls === 'transient') && attempt < MAX_RETRIES) {
      await sleep(backoff(attempt));               // ex.: 1s,2s,4s,8s + jitter
      return this.graphGet(path, params, attempt + 1);
    }
    throw new MetaApiError(body?.error, res.status);
  }

  // Espelho da hierarquia: 1 chamada por nível, paginada
  async *iterEntities(level: 'campaigns'|'adsets'|'ads'): AsyncGenerator<MetaEntity> {
    let path = `act_${this.accountId}/${level}`;
    let params = { fields: ENTITY_FIELDS[level], limit: '200' };
    let next: string | null = path;
    while (next) {
      const page = next === path ? await this.graphGet(path, params) : await this.graphGetUrl(next);
      for (const e of page.data) yield e;
      next = page.paging?.next ?? null;            // cursor-based; respeita limite serverless
    }
  }

  // Insights nível ad, time_increment=1, janela [since, until]; paginado
  async *iterInsights(since: string, until: string): AsyncGenerator<MetaInsightRow> {
    const params = {
      level: 'ad',
      time_increment: '1',
      time_range: JSON.stringify({ since, until }),
      fields: INSIGHT_FIELDS.join(','),
      limit: '200',
    };
    let next: string | null = `act_${this.accountId}/insights`;
    while (next) {
      const page = /* graphGet/graphGetUrl como acima */;
      for (const row of page.data) yield parseInsightRow(row);   // mapeia actions[] -> lpv/ic/purchases
      next = page.paging?.next ?? null;
    }
  }
}
```

```ts
// lib/meta/sync.ts
export async function runSync(trigger: 'login'|'timer'|'manual'|'cron'): Promise<SyncResult> {
  const db = admin();                                    // service_role, lib/supabase/admin.ts
  const account = await loadActiveAdAccount(db);         // 1 conta na v1
  const token = resolveToken(account.token_ref);

  // 1) LOCK compartilhado — se já roda, sai limpo (degradation: serve cache atual)
  const { data: gotLock } = await db.rpc('meta_sync_try_lock', { p_account_id: account.id });
  if (!gotLock) return { ok: true, skipped: 'locked', freshness: await readFreshness(db, account.id) };

  try {
    await markState(db, account.id, { last_status: 'running', last_started_at: now() });
    const meta = new MetaClient(token, normalizeAccountId(account.meta_account_id));

    // 2) Espelhar hierarquia (upsert por meta_id) — ORDEM: campaigns -> adsets -> ads (FKs)
    await upsertCampaigns(db, account.id, meta);          // ON CONFLICT (meta_id)
    await upsertAdsets(db, meta);                         // resolve campaign_id via meta_id pai
    await upsertAds(db, meta);                            // resolve adset_id; grava name, audience

    // 3) Mapa meta_ad_id -> ads.id (PK interno) p/ insights
    const adIdByMeta = await loadAdIdMap(db);             // { '120000...': 42, ... }

    // 4) Insights incrementais — janela móvel 14d, reprocessa assentamento
    const until = todayInBusinessTz();                   // America/Sao_Paulo -> data
    const since = minusDays(until, WINDOW_DAYS - 1);
    const batch: InsightUpsertRow[] = [];
    for await (const row of meta.iterInsights(since, until)) {
      const adPk = adIdByMeta[row.ad_id];
      if (!adPk) continue;                               // ad novo apareceu só no insight: skip (raro; hierarquia já rodou)
      batch.push({ ad_id: adPk, date: row.date, spend: row.spend, impressions: row.impressions,
                   clicks: row.clicks, link_clicks: row.link_clicks,
                   lpv: row.lpv, ic: row.ic, purchases: row.purchases });
      if (batch.length >= 500) await flush(db, batch);   // upsert_meta_insights(jsonb) em lotes
    }
    const upserted = await flush(db, batch);

    // 5) NÃO roda atribuição aqui (ver Seção 6). Sync só espelha + cacheia insights.
    await markState(db, account.id, { last_status: 'success', last_success_at: now(), rows_upserted: upserted });
    return { ok: true, upserted, freshness: now() };

  } catch (e) {
    if (e instanceof MetaTokenExpiredError) {
      await markState(db, account.id, { last_status: 'needs_reauth', last_error: 'token_expired' });
      return { ok: false, needsReauth: true };           // dashboard mostra "reconectar Meta" + serve cache
    }
    await markState(db, account.id, { last_status: 'error', last_error: String(e) });
    return { ok: false, error: String(e), freshness: await readFreshness(db, account.id) };  // degradation
  } finally {
    await db.rpc('meta_sync_unlock', { p_account_id: account.id });   // sempre libera
  }
}
```

```ts
// app/api/sync/route.ts
export const maxDuration = 60;                            // teto serverless (ajustar ao plano)
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  // server-only: roda com admin() (service_role). Em multi-user, validar sessão aqui.
  const { trigger = 'manual' } = await req.json().catch(() => ({}));
  const result = await runSync(trigger);
  return Response.json(result, { status: result.ok ? 200 : 200 }); // 200 mesmo em erro: dashboard usa cache
}

// app/api/sync/cron/route.ts
export const maxDuration = 60;
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response('forbidden', { status: 403 });
  const result = await runSync('cron');
  return Response.json(result);
}
```

Upsert da hierarquia (exemplo `ads`, via PostgREST upsert do admin client):

```ts
// dentro de upsertAds — ON CONFLICT (meta_id) DO UPDATE
await db.from('ads').upsert(
  rows.map(a => ({ adset_id: adsetPkByMeta[a.adset_id], meta_id: a.id,
                   name: a.name, audience: a.targeting_summary ?? null })),
  { onConflict: 'meta_id' }
);
```

---

## 6. Hierarquia + ligação com atribuição (recomendação)

Duas responsabilidades distintas — manter separadas (ADR-1):

1. **Sync espelha a hierarquia** (`campaigns`/`adsets`/`ads` por `meta_id`) e cacheia `meta_insights_daily`. É só isso. Não toca `attributions`.

2. **Ligar `utm_content` → `ads.meta_id`** pertence ao módulo de atribuição (Fase 3). Recomendação: **NÃO** chamar attribute_order dentro do sync. Em vez disso, o módulo de atribuição usa `ads.meta_id` (agora populado pelo sync) como tabela de lookup. O `t.js` deve gravar **`utm_content = ad.meta_id`** no link UTM (convenção crítica). Então a atribuição vira um JOIN direto:

```sql
-- No motor de atribuição (Fase 3), não no sync:
-- liga touchpoint/origin -> ad pelo meta_id que o t.js colocou em utm_content
update attributions a
set ad_id = ads.id
from touchpoints t
join ads on ads.meta_id = t.utm_content
where /* t é o último-clique 7d do visitor do pedido de a */
  and a.ad_id is null;
```

Por que assim, e não attribute_order no sync:
- **Acoplamento:** atribuição depende de `orders` (Hotmart) + `touchpoints` (script), que mudam em cadência totalmente diferente do sync do Meta. Misturar faz o sync falhar por causa de venda, e vice-versa.
- **Ordem de chegada:** uma venda pode chegar antes do ad existir na nossa base (ad criado hoje, primeiro sync às 6h). Se a atribuição for um JOIN por `meta_id` re-executável (idempotente), ela "se conserta" no próximo run quando o ad aparece. Acoplada ao sync, perde-se essa janela.
- **Recomendação concreta:** atribuição como JOIN re-executável por `meta_id` (acima), disparado pelo webhook Hotmart (Fase 2/3) e por um backfill. Se quiserem reaproveitar, o sync pode, **opcionalmente e no fim**, chamar um RPC `link_unattributed_by_meta_id()` que só preenche `attributions.ad_id` nulos onde já existe match — barato e idempotente. Mas a fonte de verdade do trigger é a atribuição, não o sync.

Para `origin` JSON da pergunta: `attributions.origin` no schema atual é `text` (classificação livre: orgânico/referrer). O `utm_content`/`utm_campaign` que ligam ao ad vivem em `touchpoints` (capturados pelo `t.js`) — é de lá que sai o JOIN, não de `attributions.origin`.

---

## 7. Resiliência (Seção 5 / §34.3-34.4)

| Tática | Implementação |
|---|---|
| Retry/backoff | `lib/meta/client.ts`: exponencial 1→2→4→8s + jitter, `MAX_RETRIES=4`, só p/ `rate_limit`/`transient` |
| Token expirado → reauth | `errors.ts: isTokenExpired` — Graph `error.code===190` (OAuthException), ou `code 102` + subcodes de expiração/invalidação. Seta `sync_state.last_status='needs_reauth'`; dashboard mostra "reconectar Meta" |
| Rate limit | `error.code 4/17/32/613` ou header `X-Business-Use-Case-Usage` perto de 100% → backoff maior / aborta o run e serve cache. Lock + janela curta + 1 conta mantêm o uso baixo (ADR-2) |
| Degradation | Qualquer falha: dashboard segue lendo a base; selo usa `sync_state.last_success_at` ("atualizado há X min"); badge de erro discreto |
| Freshness | `sync_state.last_success_at` → API expõe em `SyncResult.freshness`; UI calcula "há X min" |
| Timeout serverless | Paginação por cursor (`paging.next`); `maxDuration` na rota; upsert em lotes de 500; 1 conta × 14 dias × N ads cabe folgado. Se crescer, o loop é retomável por janela (idempotente por `ad_id,date`) |
| Lock órfão | `finally` sempre desbloqueia; `sync_state.last_started_at` + status `running` detecta órfão > N min |

```ts
// lib/meta/errors.ts (esboço)
export function classifyMetaError(err?: any): MetaErrorClass {
  if (!err) return 'fatal';
  const { code, error_subcode } = err;
  if (code === 190) return 'token_expired';                 // OAuthException (token inválido/expirado)
  if ([4,17,32,613,80000,80004].includes(code)) return 'rate_limit';
  if ([1,2].includes(code)) return 'transient';             // API unknown/temporary
  return 'fatal';
}
```

---

## 8. Pontos a confirmar quando chegar a implementação

1. **Plano Vercel** (cron 6h precisa de Pro; Hobby = 1×/dia → usar cron externo no mesmo endpoint).
2. **action_type exatos** na conta para LPV/IC/purchase (`landing_page_view` vs `omni_initiated_checkout` vs `purchase`/`omni_purchase`) — varia por pixel/Conversions API. Ajustar `ACTION_MAP`.
3. **`audience`** dos `ads`: o Graph não devolve um "público" pronto — derivar de `targeting`/`adset.targeting` ou deixar `null` na v1 (schema permite).
4. **Convenção `utm_content = ad.meta_id`** no `t.js` (Fase 1) — pré-requisito do JOIN de atribuição da Seção 6.
5. **Janela**: 14 dias é o default proposto; o usuário pediu 7-14. Configurável em `config.ts`.

Arquivos-chave referenciados: `/Users/joaofranco/Claude Code/Sistema de rastreamento Franco Advertising/supabase/migrations/0001_init.sql` e `/Users/joaofranco/Claude Code/Sistema de rastreamento Franco Advertising/arquitetura-rastreamento-utm-v1.md`.

---

## C) Guia do token (para o usuário) + crítica adversarial

Tenho todo o contexto necessário. Os dois arquivos confirmam os nomes de tabelas/campos, ADR-2 (cadência de sync), Seção 5 (mecânica + resiliência), Seção 7 (métricas) e a Stack. Vou produzir a especificação diretamente.

---

# ESPECIFICAÇÃO — Integração Meta Ads (Fase 4) — PARA IMPLEMENTAR DEPOIS

> Esta é uma especificação, não código. Nada é implementado agora. A implementação começa quando você fornecer **(1) o token System User do Meta** e **(2) o ad account id (`act_<id>`)**. Os nomes de endpoint, campos e tabelas abaixo já estão alinhados ao schema `0001_init.sql` e à `arquitetura-rastreamento-utm-v1.md` (ADR-2, Seção 5, Seção 7).

---

## PARTE A — Guia passo a passo: criar o token System User e achar o ad account id

Linguagem simples, sem jargão. Faça na ordem. Use o computador (não dá pelo celular direito).

### Antes de começar (pré-requisitos)
- Você precisa ter um **Business Manager** (Gerenciador de Negócios) da Meta. Se você roda anúncios para o seu negócio, provavelmente já tem. Endereço: **business.facebook.com**.
- Você precisa ser **administrador** desse Business Manager. Se outra pessoa criou, peça para ela te tornar admin, ou faça os passos com ela junto.

### Passo 1 — Entrar nas Configurações do Negócio
1. Abra **business.facebook.com** e faça login.
2. No canto inferior esquerdo, clique na **engrenagem** (Configurações do Negócio / "Business Settings").
3. Se você tiver mais de um negócio, confira no topo que está selecionado o negócio **certo** (o que tem a conta de anúncio que você quer rastrear).

### Passo 2 — Achar e copiar o ad account id (`act_<id>`)
Faça isso já que você está dentro das Configurações.
1. No menu da esquerda, procure **"Contas"** e clique para expandir.
2. Clique em **"Contas de anúncios"** ("Ad accounts").
3. Vai aparecer a lista das suas contas de anúncio. Clique na conta que você usa.
4. Do lado, vai aparecer um número chamado **"ID da conta de anúncios"** (ex.: `1234567890123456`). **Copie esse número** e guarde.
5. O formato que o sistema precisa é com o prefixo **`act_`** na frente: se o número é `1234567890123456`, o que você me envia é **`act_1234567890123456`**.

> Guarde esse `act_...` num bloco de notas temporário. Você vai me mandar ele junto com o token no final.

### Passo 3 — Criar o Usuário do Sistema (System User)
O "System User" é como um "funcionário robô" da sua empresa. Ele gera um token que não expira quando você troca sua senha pessoal — por isso é o jeito certo para um sistema automático.
1. Ainda nas Configurações do Negócio, no menu da esquerda procure **"Usuários"** e expanda.
2. Clique em **"Usuários do sistema"** ("System Users").
3. Clique no botão azul **"Adicionar"** ("Add").
4. Dê um nome fácil de lembrar, ex.: **`rastreamento-franco`**.
5. Em função/"role", escolha **"Funcionário"** ("Employee") — não precisa ser Admin.
6. Clique em **"Criar usuário do sistema"** e confirme.

### Passo 4 — Dar acesso à conta de anúncio para esse robô
O robô precisa de permissão para **ver** sua conta de anúncio.
1. Com o usuário do sistema que você acabou de criar selecionado, clique em **"Adicionar ativos"** ("Add Assets").
2. Escolha a categoria **"Contas de anúncios"** ("Ad accounts").
3. Marque a sua conta de anúncio (aquela do Passo 2).
4. Nas permissões, ative pelo menos **"Ver desempenho"** ("View performance") — é o suficiente para ler relatórios. Não precisa dar permissão de gerenciar/gastar.
5. Clique em **"Salvar alterações"**.

### Passo 5 — Gerar o token (com a permissão `ads_read`)
1. Ainda no usuário do sistema, clique em **"Gerar novo token"** ("Generate new token").
2. Vai pedir para escolher um **App**. Se você não tem um app, ele oferece criar/selecionar — escolha qualquer app do seu negócio (ou crie um simples; nome livre, ex.: `rastreamento`). Não precisa publicar nada.
3. Em **expiração do token**, se aparecer a opção, escolha **"Nunca"** ("Never") — assim ele não vence sozinho.
4. Vai aparecer uma lista de **permissões** ("scopes"). Marque:
   - **`ads_read`** (obrigatória — é a que lê os relatórios)
   - (opcional, ajuda) **`read_insights`** e **`business_management`**
5. Clique em **"Gerar token"**.
6. A Meta vai mostrar um **texto longo** (começa geralmente com `EAA...`). **Esse é o token.** Copie inteiro.

> AVISO IMPORTANTE: esse token é como uma **senha**. A Meta só mostra ele **uma vez**. Se fechar a janela sem copiar, terá que gerar de novo.

### Passo 6 — Como me entregar com segurança
- **NÃO** cole o token aqui no chat, **NÃO** mande por e-mail e **NÃO** poste em lugar nenhum público.
- O lugar certo é o **secret store / variável de ambiente** do servidor (na Vercel: Project Settings → Environment Variables; ou nos secrets do Supabase). Quando chegarmos lá, eu te digo o **nome exato da variável** (ex.: `META_SYSTEM_USER_TOKEN`) e você cola o valor lá, no painel, fora do chat.
- O **`act_...`** (o id da conta) pode mandar no chat sem problema — ele não é secreto. O secreto é só o token.

### O que você terá no fim
1. O **`act_1234567890123456`** (id da conta de anúncio) — me manda no chat.
2. O **token** (texto longo `EAA...`) — você coloca na variável de ambiente do servidor, não no chat.

---

## PARTE B — Crítica adversarial do plano de sync + checklist priorizada

Cada item: o problema, por que morde, e a decisão concreta (com nomes). Tudo respeita ADR-2 (cron 6h + login + 30min logado aba ativa + botão refresh; lock compartilhado; incremental; selo "atualizado há X min") e a Seção 5 (insights nível ad, breakdown campanha/conjunto/anúncio; retry/backoff, degradation, token expirado → reauth; token só no servidor).

### 1. Rate limit / pontos do Meta (Severidade ALTA)
**Problema:** A Marketing API limita por **pontos** (BUC — Business Use Case), não por nº fixo de chamadas. Insights de nível `ad` com breakdown custam mais pontos. Os 4 gatilhos da ADR-2 (cron, login, timer 30min, refresh) podem coincidir e estourar a quota; quando estoura, a API devolve erro **code 17 / 80000 / 4** e pode te bloquear por minutos.
**Por que morde:** o dashboard pode ficar sem atualizar e, pior, encadear retries cegos que pioram o bloqueio.
**Decisões concretas:**
- Ler o header **`X-Business-Use-Case-Usage`** (e `X-App-Usage`) de cada resposta; gravar o `% usado` em log estruturado e, se passar de ~**75%**, **pular** o próximo sync não-essencial (timer 30min e cron) — refresh manual e login continuam, mas com aviso.
- Backoff exponencial com jitter para code 17/80000/4/613; respeitar `Retry-After` quando vier.
- Buscar **um insight por conta** com breakdown, não N chamadas por ad. Endpoint: `GET /act_<id>/insights?level=ad&fields=...&time_increment=1&time_range={...}`. Isso é 1 chamada paginada, não milhares.
- O **lock compartilhado** (item 5) é a defesa principal contra gatilhos coincidentes.

### 2. Token que expira / é revogado (Severidade MÉDIA)
**Problema:** Mesmo "Never", o token pode ser **invalidado** (troca de senha do criador, remoção do app, revogação de permissão, mudança no Business). A API devolve **code 190** (com subcódigos 463/467/460).
**Por que morde:** sync silenciosamente para de funcionar e o dashboard mostra dados velhos sem ninguém perceber.
**Decisões concretas:**
- No `lib/meta/client.ts`, mapear **code 190** para um estado explícito `TOKEN_INVALID` (não um retry comum).
- Persistir esse estado em `ad_accounts` (sugerir nova coluna em migration futura, ex.: `sync_status text` e `sync_error text` — versionada como `0002_meta_sync_state.sql`).
- O dashboard mostra um **banner de reauth** ("Reconecte o Meta") em vez de erro genérico. O selo "atualizado há X min" fica vermelho.
- **Nunca** logar o token no erro (ver item 9).

### 3. Fuso horário: dia do insight no fuso da conta vs America/Sao_Paulo (Severidade ALTA — silencioso)
**Problema:** O Meta agrega insights por dia **no fuso da conta de anúncio** (`account_timezone`, que pode ser America/Sao_Paulo, mas pode estar em outro, ex.: PST se a conta foi criada nos EUA). O webhook Hotmart e o nosso `t.js` gravam `timestamptz` (UTC no banco), e o dashboard lê em America/Sao_Paulo (já documentado no header do `0001_init.sql`). Se o fuso da conta ≠ America/Sao_Paulo, o `meta_insights_daily.date` **não bate** com a data das vendas → ROAS por dia fica torto, sem erro nenhum aparecer.
**Por que morde:** é o bug mais perigoso porque **não quebra nada** — só dá número errado.
**Decisões concretas:**
- No primeiro sync, ler `GET /act_<id>?fields=timezone_name,currency` e **gravar** `account_timezone` e `currency` (sugerir colunas em `ad_accounts`, migration `0002`).
- **Decisão de design a confirmar com você:** ou (a) tratar `meta_insights_daily.date` explicitamente como "dia no fuso da conta" e converter na camada de leitura para alinhar com vendas em America/Sao_Paulo; ou (b) se o fuso da conta já for America/Sao_Paulo, não há conversão. Documentar essa escolha no topo da migration.
- Validação no primeiro sync: se `account_timezone != 'America/Sao_Paulo'`, **avisar no log** com destaque, porque toda a reconciliação Seção 7 depende disso.

### 4. Idempotência do upsert (Severidade MÉDIA)
**Problema:** Sync incremental re-busca os últimos ~7–14 dias toda vez (ADR-2). Sem idempotência, duplicaria `meta_insights_daily`. O schema já protege com `unique(ad_id, date)`.
**Por que morde:** o risco real não é duplicar (o unique pega) — é o **upsert sobrescrever bom dado com dado pior**. Insights recentes (hoje, ontem) ainda estão "assentando" no Meta; um valor de hoje pode ser **menor** que o de ontem para o mesmo dia.
**Decisões concretas:**
- Upsert via `on conflict (ad_id, date) do update set` em **todos** os campos métricos + `synced_at = now()`. Isso é correto: o Meta é a fonte de verdade do insight; o valor mais novo ganha.
- **Pré-requisito FK:** o ad precisa existir em `ads` antes do insight (FK `meta_insights_daily.ad_id → ads.id`). Logo o sync resolve a hierarquia **primeiro**: upsert em `campaigns` → `adsets` → `ads` (cada um por `meta_id` unique), e só então mapeia `meta_id` do Meta para o `ads.id` interno (bigint) antes de inserir o insight. Atenção: o insight do Meta vem com `ad_id` = **meta_id (string)**, mas a tabela quer o **id interno (bigint)** — esse mapeamento é obrigatório e é fonte clássica de bug.
- Janela de re-sync de ~**14 dias** para reabsorver assentamento e atribuições tardias.

### 5. Lock que trava preso / stale lock / deadlock (Severidade MÉDIA-ALTA)
**Problema:** ADR-2 exige lock compartilhado entre 4 gatilhos. Em serverless (Vercel), uma função pode **morrer no meio** (timeout, item 6, crash) e deixar o lock preso → nenhum sync roda mais, para sempre.
**Por que morde:** o sistema "congela" silenciosamente; ninguém percebe até notar dados velhos.
**Decisões concretas:**
- Lock em Postgres, **não em memória** (serverless não compartilha memória). Duas opções:
  - **`pg_try_advisory_lock`** dentro de uma RPC `meta_sync_acquire()` — leve, mas some se a conexão cair (bom contra stale, mas não dá visibilidade).
  - **Lock-row** com TTL: tabela `meta_sync_lock(id, locked_at, locked_by, expires_at)`; aquisição via RPC que só pega se `expires_at < now()` (lock expirado é roubável). **Recomendado** por dar visibilidade + auto-cura de stale lock.
- TTL do lock = **maior** que o timeout da função (ex.: função 60s → TTL 120s) para não roubar lock de um sync ainda vivo.
- Toda RPC de lock com `revoke execute from anon, authenticated` + `grant` só ao service_role (padrão de segurança do projeto).
- Liberar o lock em **`finally`** sempre; e o TTL é a rede de segurança se o `finally` não rodar.

### 6. Limite de tempo da função serverless (Severidade ALTA)
**Problema:** Vercel limita o tempo de execução (segundos a poucos minutos, conforme plano). Uma conta com muitos anúncios e janela de 14 dias × `time_increment=1` paginado **não cabe** numa única invocação.
**Por que morde:** a função é morta no meio, deixa lock preso (item 5) e dado parcial.
**Decisões concretas:**
- Sync como **job retomável**, não uma chamada longa. Salvar **cursor de paginação** (a `paging.cursors.after` do Meta) em estado durável (`meta_sync_lock` ou tabela `meta_sync_state`) e processar em **lotes**.
- Botão refresh: `POST /api/meta/sync` retorna rápido (dispara o job e responde "iniciado"), o dashboard faz **poll** do `synced_at`/`sync_status` (a Seção 8 já prevê spinner; SSE fica para depois).
- Cron de 6h: rodar como **Supabase Edge Function / Cron** (a Stack já cita), que tolera melhor jobs do que função serverless da Vercel, ou encadear invocações curtas até o cursor acabar.
- Cada lote faz seu próprio upsert e atualiza `synced_at` parcial, para que uma morte no meio deixe progresso, não lixo.

### 7. Conta com muitos anúncios paginando (Severidade MÉDIA)
**Problema:** `level=ad` × 14 dias gera muitas linhas; a API pagina. Paginação ingênua (sem cursor persistido) recomeça do zero a cada timeout.
**Decisões concretas:**
- Usar **cursor-based paging** do Meta (`after`), persistido (item 6), com `limit` por página moderado (ex.: 100–500) para caber no tempo.
- Considerar **`time_increment=1`** + `fields` mínimos (só o que a Seção 5 lista) para reduzir payload por linha.
- Para resync histórico total (raro/manual, ADR-2), endpoint separado `POST /api/meta/sync?mode=backfill&since=YYYY-MM-DD` rodando como job, nunca no caminho do login.

### 8. Valores monetários / moeda (Severidade MÉDIA — silencioso)
**Problema:** `spend` do Meta vem na **moeda da conta**. O schema guarda `numeric(14,2)`. Dois riscos: (a) a moeda não ser BRL e ninguém perceber, misturando com faturamento Hotmart em BRL no ROAS → número sem sentido; (b) algumas contas reportam valores em **centavos/menor unidade** dependendo do campo/endpoint — `spend` no insights normalmente vem em unidade maior (ex.: "12.34"), mas é preciso confirmar.
**Decisões concretas:**
- Gravar `currency` da conta (item 3, migration `0002`) e, no primeiro sync, **avisar** se `currency != 'BRL'`.
- Tratar `spend` como string decimal e converter para `numeric(14,2)` com cuidado (não usar float; parsear como decimal). Confirmar no primeiro insight real se o valor está em reais ou centavos antes de confiar no ROAS.
- ROAS (Seção 7) só é válido se Meta-`spend` e Hotmart-`net_value` estiverem na **mesma moeda**. Documentar essa premissa.

### 9. O que NÃO logar (Severidade ALTA — segurança)
**Problema:** Em erro/retry é tentador logar a request inteira — que inclui o **token na query string ou header**. Token em log = vazamento.
**Decisões concretas:**
- **Nunca** logar: o token, a URL completa com `access_token=...`, headers de auth, nem o `raw` de respostas que ecoem o token.
- Antes de logar qualquer URL, **redigir** `access_token` (regex → `access_token=***`). Logar só: endpoint, `level`, janela de datas, código de erro, `% de quota` dos headers de uso.
- Token vive **só** em env var no servidor (`META_SYSTEM_USER_TOKEN`); nunca no banco (o schema já documenta isso: `ad_accounts.token_ref` guarda só uma **referência**, nunca o token), nunca no client, nunca em resposta de API nossa, nunca em mensagem de erro mostrada no dashboard.
- Garantir que o cliente Meta roda **server-only** (mesma fronteira do `lib/supabase/admin.ts` já existente).

---

### Checklist priorizada (ordem de implementação quando o token chegar)

| # | Item | Sev. | O que entregar |
|---|---|---|---|
| P0 | **Token só no servidor + redação de logs** (itens 2, 9) | ALTA | `META_SYSTEM_USER_TOKEN` em env; `lib/meta/client.ts` server-only; redator de `access_token` em todo log |
| P0 | **Fuso da conta vs America/Sao_Paulo** (item 3) | ALTA | ler `timezone_name`; migration `0002` com `account_timezone`; conversão documentada na camada de leitura |
| P0 | **Moeda da conta** (item 8) | ALTA-silenc. | ler `currency`; aviso se != BRL; parse decimal de `spend` |
| P1 | **Lock auto-curável (TTL)** (item 5) | M-ALTA | tabela `meta_sync_lock` + RPC `meta_sync_acquire/release` com revoke anon/authenticated; TTL > timeout |
| P1 | **Job retomável + cursor persistido** (itens 6, 7) | ALTA | `POST /api/meta/sync` dispara job; cursor `after` em estado durável; lotes; poll do `synced_at` |
| P1 | **Rate limit / pontos** (item 1) | ALTA | ler `X-Business-Use-Case-Usage`; backoff+jitter; pular sync não-essencial acima de ~75% |
| P2 | **Hierarquia antes do insight + mapeamento meta_id→id** (item 4) | MÉDIA | upsert `campaigns`→`adsets`→`ads` por `meta_id`; mapear para id interno antes do insight |
| P2 | **Upsert idempotente + janela 14d** (item 4) | MÉDIA | `on conflict (ad_id,date) do update`; `synced_at=now()`; re-sync 14 dias |
| P2 | **Token inválido → reauth na UI** (item 2) | MÉDIA | code 190 → `sync_status='TOKEN_INVALID'`; banner de reconexão; selo vermelho |
| P3 | **Backfill manual separado** (item 7) | BAIXA | `POST /api/meta/sync?mode=backfill`; fora do caminho de login |
| P3 | **Degradation visível** (Seção 5) | BAIXA | dashboard abre com último cache + selo "atualizado há X min" mesmo com Meta fora |

---

### Pendências que dependem de você (antes da Fase 4)
1. **`act_<id>`** da conta — manda no chat.
2. **Token** — você cola na env var quando eu te der o nome (não no chat).
3. **Confirmar o fuso** da conta de anúncio (Passo 2, a tela mostra; ou eu leio via API no primeiro sync). Se não for America/Sao_Paulo, a conversão do item 3 vira obrigatória.
4. **Confirmar a moeda** da conta (idem). ROAS só fecha se for BRL como o Hotmart.

---

Arquivos de referência relevantes (caminhos absolutos):
- `/Users/joaofranco/Claude Code/Sistema de rastreamento Franco Advertising/supabase/migrations/0001_init.sql` — schema atual (`meta_insights_daily` unique(ad_id,date), `ad_accounts.token_ref`, RLS sem políticas públicas).
- `/Users/joaofranco/Claude Code/Sistema de rastreamento Franco Advertising/arquitetura-rastreamento-utm-v1.md` — ADR-2 (Seção 2), mecânica e resiliência do sync (Seção 5), métricas (Seção 7), Fase 4 (Seção 11).

Migration nova sugerida quando implementar: `/Users/joaofranco/Claude Code/Sistema de rastreamento Franco Advertising/supabase/migrations/0002_meta_sync_state.sql` (colunas `account_timezone`, `currency`, `sync_status`, `sync_error` em `ad_accounts`; tabela `meta_sync_lock`; RPCs de lock com revoke anon/authenticated).
