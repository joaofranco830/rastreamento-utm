# PROGRESSO — Sistema de Rastreamento por UTM

> Registro do que já foi feito e do que falta. Atualizado a cada passo.
> Fonte de verdade do desenho: `arquitetura-rastreamento-utm-v1.md`.

---

## Visão geral das fases

| Fase | Tema | Status |
|---|---|---|
| 0 | Fundação | ✅ concluída |
| 1 | Rastreio (script + ingestão) | ✅ concluída |
| 2 | Vendas + reembolsos (webhook Hotmart) | ✅ NO AR (deploy Vercel + webhook testado) · ⏳ falta apontar na Hotmart |
| 3 | Atribuição (o coração) | ✅ concluída |
| 4 | Integração Meta | ✅ concluída (sync no ar + cron 6h) |
| 5 | Dashboard | ✅ concluída (escopo v1, no ar) |
| 6 | Endurecimento | ⏳ não iniciada |

---

## 🌐 Produção (Vercel) — NO AR

- **App:** https://rastreamento-utm.vercel.app (projeto Vercel `rastreamento-utm`, team `jguilherme830-9670s-projects`).
- **Webhook Hotmart:** `https://rastreamento-utm.vercel.app/api/webhook/hotmart`
- **Endpoint de coleta (t.js):** `https://rastreamento-utm.vercel.app/api/collect` · script em `https://rastreamento-utm.vercel.app/t.js`
- **Segredos** configurados na Vercel (production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `HOTMART_HOTTOK`.
- **Deployment Protection** (Vercel Authentication) **desligada** — necessária para a Hotmart/funil alcançarem o app; a autenticação do dashboard é a nossa (Supabase, via proxy.ts).
- Framework do projeto = `nextjs` (precisou ser setado; sem isso as rotas dinâmicas davam 404).
- Testado ao vivo: webhook grava no banco (compra→reembolso→líquido 0), valida Hottok (401 se errado).
- **VENDAS REAIS já entrando** (desde 14/06 ~12:37): o webhook está recebendo eventos reais da Hotmart. (Esses dados são REAIS — não apagar.)
- **Bug corrigido em produção (migration 0007):** status `COMPLETED` (com "d") não entrava no recálculo do bruto → vendas `completed` ficavam R$ 0. Agora o recálculo usa uma função única `recompute_order_totals()` (inclui approved/complete/completed) e os pedidos existentes foram reprocessados.
- **Fase 4 (prep, migration 0006):** `resolve_attribution_ads()` liga `attributions.ad_id` ao anúncio (`utm_content` → `ads.meta_id`), testado com dados sintéticos. Roda após o sync do Meta popular `ads`.
- **Guia de instalação do rastreio:** `docs/instalacao-rastreio.md` (snippet pronto pro funil).
- ⚠️ As vendas reais estão **sem atribuição** (`visitor_id` null) porque o `t.js` ainda não está no funil — instalar para começar a atribuir.

### ⏯️ Falta você (1 passo): apontar o webhook na Hotmart
- URL acima + Hottok (o que você já me deu) + eventos: **APPROVED, COMPLETE, REFUNDED, CHARGEBACK, CANCELED, PROTEST**.
- Depois, "enviar teste" na Hotmart → eu valido o payload real (ver sandbox abaixo).
- Para instalar o rastreio no funil, cole o snippet (Fase 1) apontando para `https://rastreamento-utm.vercel.app/t.js` e `data-endpoint="https://rastreamento-utm.vercel.app/api/collect"`.

---

## Fase 0 — Fundação

### Decisões desta fase
- Stack: **Next.js 16 (App Router) + TypeScript + Tailwind**, **Supabase** (Postgres + Auth), deploy futuro na **Vercel**.
- Fuso do negócio: **America/Sao_Paulo**. Janela de atribuição: **7 dias**.
- Ferramentas instaladas **sem precisar de senha de admin**: Node via **nvm**, Supabase CLI via **npm** (dev dependency).
- **Supabase na nuvem (plano gratuito, R$ 0/mês)** — projeto `rastreamento-utm`, org FRANCO ADVERTISING, região **sa-east-1** (São Paulo). ID do projeto: `raipfvawzlwcioyfnbwn`. (Escolhemos nuvem em vez de Docker local pela simplicidade; é o mesmo banco que usaríamos em produção.) O **app roda local**; **deploy** (Vercel) fica para fase futura.
- Segurança: **RLS ligado em todas as tabelas, sem políticas públicas** → acesso só pelo servidor (service_role). Confirmado pelo advisor (avisos "RLS sem política" são intencionais).

### Feito
- [x] Node.js (LTS, via nvm) + npm.
- [x] Projeto Next.js criado (TS, App Router, Tailwind, ESLint).
- [x] Estrutura de pastas por domínio (`lib/tracking|meta|sales|attribution|supabase`, `app/api/...`).
- [x] `CLAUDE.md` e `arquitetura-rastreamento-utm-v1.md` copiados para o repo.
- [x] Bibliotecas Supabase (`@supabase/supabase-js`, `@supabase/ssr`) + Supabase CLI.
- [x] `supabase init` (config local).
- [x] Migration `0001_init.sql` com TODAS as tabelas da Seção 6 + constraints de ouro.
- [x] Clientes Supabase (browser/server) + middleware de proteção de rotas.
- [x] Tela de login + home protegida + botão sair.
- [x] `lib/config.ts` (timezone, janela 7d, regra do visitor_id).
- [x] `.env.local.example` (modelo de segredos; `.env*` no `.gitignore`).
- [x] `PROGRESSO.md` (este arquivo).

### Banco na nuvem
- [x] Projeto Supabase criado (`rastreamento-utm`, sa-east-1, gratuito).
- [x] Migration aplicada → 12 tabelas criadas, todas com RLS.
- [x] `.env.local` gerado (URL + chave pública). Service role: pegar no painel na Fase 1/2.
- [x] Usuário criado e **login testado de ponta a ponta** (token recebido).
- [x] `npm run dev` sobe; `/` redireciona para `/login`; `/login` responde 200.

### Definição de pronto (DoD) — ✅ CONCLUÍDA
- [x] App roda em `localhost` e abre sem erro.
- [x] Todas as tabelas criadas via migration versionada.
- [x] Login funciona; rota protegida exige sessão.
- [x] Timezone e janela de 7 dias fixados em config.
- [x] `.env` ignorado; nenhum segredo commitado.
- [x] Commits pequenos feitos.
- [x] Deploy NÃO feito (fica para quando autorizado).

### Pendência leve (não bloqueia)
- [ ] Ligar "Leaked Password Protection" no painel do Supabase (Auth) — opcional.
- [ ] Trocar a senha temporária de login quando quiser.

---

## Fase 1 — Rastreio (script + ingestão)

### Feito
- [x] `public/t.js` — script vanilla: `visitor_id` 24-hex lowercase, cookie+localStorage com reconciliação, captura UTM/`fbclid`/referrer, envio via `sendBeacon` (fallback `fetch keepalive`), eventos `pageview` + `checkout_iniciado`, injeção de `src` nos links Hotmart (4 camadas: scan, MutationObserver, clique em capture, patch `window.open`).
- [x] `app/api/collect/route.ts` — ingestão server-side: valida `visitor_id`, allow-list anti-PII em url/referrer, upsert `visitors` (preserva `first_touch`), `touchpoints` condicional com dedup consecutivo, insert `tracking_events`, CORS, runtime nodejs.
- [x] `lib/supabase/admin.ts` — cliente `service_role` com `import "server-only"` (build quebra se vazar pro client).
- [x] `proxy.ts` — exclui `/api/*` e estáticos (`/t.js`, `.html` etc.) da checagem de sessão.
- [x] `public/teste-funil.html` — página de teste local.
- [x] Revisão adversarial (design + 5 dimensões) aplicada; 5 achados corrigidos (PII allow-list, bfcache `pageshow`, blindagem do crypto).
- [x] Testado contra o banco real: visitante/touchpoint/evento corretos; dedup de touchpoint OK; sem PII (só `utm_*`/`fbclid` sobrevivem em url/referrer). Dados de teste removidos.

### Snippet de instalação (colar em TODAS as páginas do funil, antes de `</body>`)
```html
<!-- Em produção, troque pelo domínio do app publicado (Vercel) -->
<script
  src="https://SEU-APP.vercel.app/t.js"
  data-endpoint="https://SEU-APP.vercel.app/api/collect"
  data-hotmart-hosts="hotmart.com"
  data-checkout-url="pay.hotmart.com,/checkout,/comprar"
  async></script>
```
> Teste local: abra `http://localhost:3000/teste-funil.html?utm_source=ig&utm_campaign=teste`.

### DoD — ✅ CONCLUÍDA
- [x] Abrir página com UTM gera `visitors`/`touchpoints`/`tracking_events` corretos.
- [x] `visitor_id` persiste (cookie+localStorage) e respeita a regra de ouro (≤30, lowercase, sem `_`).
- [x] `src` é injetado nos links de checkout Hotmart.
- [x] TypeScript e ESLint limpos.

### A validar no sandbox Hotmart (antes da Fase 3)
- [ ] Confirmar que `src` aceita ≥24 chars e volta **inalterado** no objeto `origin` do Webhook 2.0 (sem corte/mudança de caixa).
- [ ] Confirmar nome exato dos campos em `origin` (`src`/`sck`/`xcod` vs `xcode`).
- [ ] Testar o widget de checkout embarcado (iframe) — pode exigir passar `src` via config do snippet Hotmart.

### Dívidas anotadas (Fase 6 — Endurecimento)
- Rate limiting no `/collect` (hoje só há limite de 8 KB + validação rígida).
- Avaliar nome neutro do script/endpoint vs ad-block.

---

## Fase 2 — Vendas + reembolsos (webhook Hotmart)

### Feito (código pronto e testado contra o banco real)
- [x] `POST /api/webhook/hotmart` — valida **Hottok** (timing-safe), parse defensivo, ACK 200.
- [x] `lib/sales/hotmart.ts` (parser do payload 2.0) + `lib/sales/contact-hash.ts` (sha256, sem PII).
- [x] RPC atômica `apply_hotmart_event` (migrations 0002/0003/0005): idempotente (dedupe por `event_id` + fallback determinístico), **líquido** (`net_value` gerado), **gross/refunded/status recalculados de `order_events`** (ordem-independente), restatement por coorte (`order_date` da venda original), não-regressão de status terminal.
- [x] Revisão adversarial (10 achados na 1ª + reforço na 3ª) — todos corrigidos.
- [x] Testado: compra→líquido; reembolso total→0; parcial→reduz; **parcial/reembolso ANTES da venda**→correto; reenvio não duplica; Hottok inválido→401; anon não chama a RPC→401.

### Deploy + validação no sandbox — FEITO
- [x] **Deploy na Vercel** (no ar) e webhook apontado na Hotmart; "enviar teste" recebido e processado.
- [x] **Payload real validado** (teste da Hotmart): confirmados os caminhos `data.purchase.{transaction,status,price.value,order_date,approved_date}`, envelope `{id,event,version,creation_date}`, **Hottok no header** `X-HOTMART-HOTTOK`, status reais (APPROVED, COMPLETED, REFUNDED, CHARGEBACK, CANCELED, DISPUTE, EXPIRED, BILLET_PRINTED, DELAYED) + evento `ORDER_FULFILLMENT`. Recompute de gross/refunded/status correto com 9 eventos misturados no mesmo pedido.

### ✅ `src` confirmado na 1ª venda real rastreada (15/06)
- Venda real (Imersão Geografia da Voz) veio com **`data.purchase.origin.src = <nosso visitor_id 24-hex>`** — caminho confirmado, parser correto.
- **Dash fácil e o nosso convivem:** mesma venda trouxe `origin.src` (nosso) **e** `origin.sck` (composto da Dash fácil) — sem conflito.
- **Bug encontrado e corrigido:** os pageviews do `t.js` não chegavam ao `/collect` (data-endpoint caía no domínio do funil / atributo removido pelo construtor). O `t.js` agora **auto-detecta o endpoint** pela própria origem do script (deploy feito; funil pega na próxima visita por `max-age=0`).
- ✅ **CICLO FECHADO (15/06):** após o fix, vendas reais do funil rastreado passaram a atribuir. Ex.: HP2002806099 (R$47) → visitante capturado → campanha "[VEN][GEO-VOZ-02][PRÉ ESCALA AD0012]" → ROAS no dashboard. `visitors`/`touchpoints` populando (35+).
- **Convenção de UTM do cliente (importante):** `utm_campaign` = NOME da campanha (bate com o Meta) e `utm_content` = slug (ex.: `geo-voz-ad0012`, NÃO o `{{ad.id}}`). Por isso o dashboard credita por **nome de campanha** (0012). Para granularidade **por anúncio**, configurar nos anúncios do Meta `utm_content={{ad.id}}`.

---

## Fase 3 — Atribuição (o coração) ✅

### Feito (testado contra o banco real)
- [x] `attribute_order()` (migrations 0004/0005): **last-click 7 dias** determinístico (`origin.src == visitor_id`) + **fallback por contato** (implementado, **DORMENTE** até o `t.js` capturar contato do visitante).
- [x] Janela `(order_date − 7d, order_date]` em UTC; desempate `ts desc, id desc`; testado borda, fora-da-janela e last-click do mais recente.
- [x] `origin` em **JSON** (snapshot do toque vencedor + `touchpoint_id` + `class`) → a Fase 4 liga `ad_id` por `utm_content` → `ads.meta_id` **sem migração**.
- [x] `classify_origin()` (paid_meta / paid_meta_fbclid / organic / referral / direct) por host ancorado.
- [x] Chamada **inline** no webhook (idempotente, tolerante a falha — atribuição nunca derruba a venda); **reembolso herda** automaticamente.
- [x] `lib/attribution/origin.ts` (leitura) e `backfill.ts` (reprocessar, paginado).
- [x] Revisão adversarial (13 achados) — corrigidos na migration 0005.

### DoD
- [x] Venda com UTM atribui ao criativo certo (testado: ad_aaa, ad_new, ad_live).
- [x] Reembolso aparece sob o mesmo criativo (atribuição preservada, `net_value` cai).
- [ ] "Venda sem src casa pelo fallback" — lógica pronta, mas **dormente** (sem captura de contato do visitante na v1). Ativará quando o `t.js` capturar contato.

### Limitações conscientes (anotadas)
- `ad_id` fica **null** até a Fase 4 (tabela `ads` vazia); a origem por UTM já está guardada para o join.
- Fallback por contato dormente (decisão "sem PII no rastreio" da Fase 1).

---

## Fase 4 — Meta Ads (design pronto, NÃO implementado)

Pesquisa + spec em **`docs/fase4-design.md`**. Precisa de você quando chegarmos lá:
- **Token System User do Meta** (permissão `ads_read`) + **ad account id** (`act_<id>`) — guia passo a passo no doc.
- **Convenção de URL no Meta Ads Manager** (campo "Parâmetros de URL" do anúncio): `utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.id}}&utm_term={{adset.id}}`. O `{{ad.id}}` em `utm_content` é o que liga a venda ao anúncio (já preparado na Fase 3).
- Nota 2026: o Meta removeu as janelas `7d_view`/`28d_view`; usaremos `7d_click` (alinha com nosso last-click 7d).

---

## Fase 4 — Integração Meta Ads ✅ (no ar)

- Conta validada: **BM-CLAUDIO ELISIO**, `act_555908086246166`, moeda **BRL**, fuso **America/Sao_Paulo** (= nosso fuso → datas dos insights já alinhadas).
- `lib/meta/client.ts` (Graph API v25, insights nível ad, paginação, `actions[]` com janela `7d_click`) + `lib/meta/sync.ts` (lock → upsert hierarquia + `meta_insights_daily` → `resolve_attribution_ads` → release) + `app/api/sync/route.ts` (protegido por `SYNC_SECRET`).
- **Cadência:** cron **6h** via **pg_cron + pg_net** (Vercel grátis limita a 1x/dia) chamando `/api/sync`; segredo no **Supabase Vault**. On-demand pelo mesmo endpoint. (Os gatilhos "login" e "30 min logado" entram com o dashboard, Fase 5.)
- **Testado real:** 26 campanhas, 41 conjuntos, 131 anúncios, **769 insights** (15 dias), gasto **R$ 13.244,86**; idempotente (re-sync não duplica); 401 sem segredo; cron executou OK (`meta_sync_state.last_status='ok'`).
- Env na Vercel (production): `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `SYNC_SECRET`.
- ⏳ `attributions.ad_id` liga sozinho quando houver **vendas rastreadas** com `utm_content={{ad.id}}` (hoje `ad_links=0`).

---

## Fase 5 — Dashboard ✅ (escopo v1, no ar)

- `app/page.tsx` (protegido por login): cartões (Investido, Vendas líq., Faturamento líq., ROAS), funil, reembolso (pedidos + % faturamento), reconciliação Meta×nosso, tabela por campanha, seletor de período (7/14/30/90), botão **Atualizar Meta** (server action → sync), selo de freshness.
- SQL: `dashboard_summary` + `dashboard_by_campaign` (0010) com correções da revisão (0011): net_sales NULL-safe e idêntico nas duas; expõe pedidos sem data; tudo líquido + coorte + fuso SP, sem divisão por zero.
- Revisão adversarial (6 achados) aplicada. Funções revogadas de anon/authenticated; leitura via admin atrás do login.
- **V2 (anotado, não implementar agora):** o usuário tem MUITAS funções extras planejadas para o dashboard — ficam para a v2.
- ⚠️ Não foi possível tirar print automático (preview local quebra com Turbopack+nvm — só ambiente local; build e produção OK). Verificado por build + dados reais + produção servindo.

---

## Descobertas / a validar (carregado da arquitetura)
- **Sandbox Hotmart** (antes da Fase 3): confirmar comprimento e caixa de `src`/`sck` e a forma exata do objeto `origin`.
- **Reembolso parcial**: reduz faturamento, mantém conversão (padrão adotado).
- **Restatement por coorte**: estorno deduz da data/origem da venda original (padrão adotado).

---

## Ideias de v2 (NÃO implementar agora — só anotar)
- Jornada do cliente (first touch → caminho → conversão) — dados já capturados em `touchpoints`.
- Modelo de custo/lucro monetário (COGS, taxas, impostos).
- Multi-usuário, alertas, automações, Google/TikTok, API pública.
