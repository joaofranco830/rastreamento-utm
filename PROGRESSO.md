# PROGRESSO — Sistema de Rastreamento por UTM

> Registro do que já foi feito e do que falta. Atualizado a cada passo.
> Fonte de verdade do desenho: **v1** `arquitetura-rastreamento-utm-v1.md` (base) · **v2** `arquitetura-rastreamento-utm-v2.md` (vigente).
>
> ## 🚀 V2 NO AR (parcial) — desde 20/06
> - **Git da Vercel conectado** → todo merge na `main` publica sozinho (deploy automático). Deploy de produção READY (~28s, sem erros de runtime).
> - **No ar:** Tela **Central** (`/central`), Tela **Origem** (`/origem`), **Configurações** (`/configuracoes`) + V2-1 (webhook guardando comprador/produto, `/collect` com geo/fbp, `t.js` com `_fbp`/`_fbc`) + V2-2 (sync Meta com vídeo/status, ativa no próximo cron 6h ou botão "Atualizar Meta").
> - **Falta:** V2-6 (Tela Campanhas) e V2-7 (retenção/poda).
>
> ### Correções pós-deploy (20/06, feedback do uso real)
> - **Bug do "Atualizar Meta":** a Graph API rejeitava `video_3_sec_watched_actions` (campo inválido) → sync inteiro falhava. Fix: removido; views de 3s vêm de `actions[video_view]`.
> - **V2 é o padrão:** `/` redireciona pra `/central`; o dashboard v1 foi pra `/v1` (link discreto em Configurações) — acabou a confusão "v1×v2" que mostrava a conta inteira. Barra de navegação V2 nova (Central · Origem · **Configurações** em destaque · Atualizar Meta · Sair).
> - **Performance:** funções movidas pra **gru1 (São Paulo)** via `preferredRegion`, ao lado do Supabase (sa-east-1) — corta a latência cross-region de cada clique.
> - **Confirmado:** com a config do usuário (tag `[GEO-VOZ-02]` + 2 produtos), a V2 mostra investido R$ 12.900 e faturamento R$ 6.587 (escopo correto). Os R$ 23k eram a v1.
> - **Vídeo corrigido:** o sync puxava vídeo com a janela `7d_click` (valor atribuído, pequeno) → plays minúsculo, retenção >100%. Agora usa o TOTAL (`value`). Re-sync ("Atualizar Meta") repopula correto.
> - **Campanhas estilo gerenciador:** tela trocada por árvore expansível (campanha ▸ conjuntos ▸ anúncios), várias abertas ao mesmo tempo, com colunas de vídeo cru (3s/plays/75%).
>
> ## 🚦 Status
> - **v1 — CONCLUÍDA e em produção** (Fases 0→6): app na Vercel, webhook Hotmart, sync Meta (cron 6h), dashboard com **vendas reais**.
> - **Código no GitHub (público):** https://github.com/joaofranco830/rastreamento-utm
> - **v2 — INICIANDO** (Fases V2-0 → V2-7): seleção de produto/campanha por tag, captura ampliada + PII server-side, atribuição em 3 níveis, sync Meta com vídeo, 3 telas novas, retenção/poda. **Só mostra dados** (zero automação). Plano em `arquitetura-rastreamento-utm-v2.md` §11.

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
| 6 | Endurecimento | ✅ concluída (no ar) |

### v2 — em execução (detalhe em `arquitetura-rastreamento-utm-v2.md` §11)

| Fase | Tema | Status |
|---|---|---|
| V2-0 | Config base (produtos + campanhas por tag + retenção) | ✅ concluída (migration 0015 + tela /configuracoes) |
| V2-1 | Atribuição ampliada (sinais + PII + enriquecimento) | ✅ código pronto (migration 0016 aplicada; validação ao vivo no marco/deploy) |
| V2-2 | Sync do Meta ampliado (vídeo + status) | ✅ código pronto (migration 0017 aplicada; sync ao vivo no marco/deploy) |
| V2-3 | Camada de dados (funções de dashboard) | ✅ concluída (central/origem/clientes/campanhas/criativos) |
| V2-4 | Front-end: Tela Central | ✅ construída (rota /central; validação visual no deploy) |
| V2-5 | Front-end: Tela Origem das UTMs | ✅ construída (rota /origem: origem + clientes expansíveis) |
| V2-6 | Front-end: Tela Campanhas (estilo gerenciador) | ✅ construída (rota /campanhas: drill-down + todas as colunas + criativos) |
| V2-7 | Retenção + endurecimento | ✅ concluída (poda pg_cron + advisors 0 erros) |

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
- **Por criativo (0013):** `dashboard_by_creative` agrupa por NOME do criativo (`utm_content` = nome do anúncio no Meta, ex.: `geo-voz-ad0012`), somando o gasto de anúncios duplicados (mesmo criativo reusado). Validado com venda real.
- **V2 (anotado, não implementar agora):**
  - **Seletor de produto + campanhas a considerar no "investido"**, via TAG no nome da campanha (ex.: `[GEO-VOZ-02]`). Hoje o "Investido" soma a conta toda (inclui campanhas de conteúdo/outros produtos), então o ROAS-cabeça mistura tudo até existir esse filtro.
  - Muitas outras funções de dashboard planejadas pelo usuário.
- ⚠️ Não foi possível tirar print automático (preview local quebra com Turbopack+nvm — só ambiente local; build e produção OK). Verificado por build + dados reais + produção servindo.

---

## Fase 6 — Endurecimento ✅ (no ar)

> Objetivo: deixar o que já está no ar mais resistente a abuso, falha e privacidade — sem inventar feature nova. Tudo abaixo está em produção.

### Feito
- [x] **Rate limit no `/api/collect`** — `lib/ratelimit.ts` (janela deslizante em memória, best-effort por instância serverless), 60 req / 10 s por IP. Sob flood responde 204 silencioso (o `t.js` ignora o corpo). Contém abuso sem derrubar coleta legítima.
- [x] **Resiliência do sync do Meta** — `lib/meta/client.ts` ganhou `fetchPage` com retries + backoff (500ms→1s→2s) em erros transitórios (rede, HTTP 429/5xx, códigos de cota). Erros de auth (token expirado, código 190 etc.) NÃO repetem — sinalizam reauth na hora.
- [x] **Degradação visível no dashboard** — `app/page.tsx`: banner âmbar quando o Meta está defasado (último sync falhou OU >12h sem sync). O dashboard segue mostrando os últimos dados salvos (regra de ouro: lê sempre do nosso banco, nunca do Meta ao vivo).
- [x] **Do Not Track (privacidade/LGPD)** — `t.js` aborta o rastreio logo no início se o navegador sinaliza DNT (`navigator.doNotTrack==="1"` / `"yes"`). Não cria `visitor_id`, não envia evento.
- [x] **Hardening do banco (migration 0014)** — `search_path = public` fixado em todas as 11 funções (advisor `function_search_path_mutable` zerado). Evita sequestro de resolução de nomes por `search_path` malicioso.

### Recheck de segurança (Supabase advisors) — pós-fase
- **0 erros.** Restam só avisos esperados/baixo risco:
  - 13× **"RLS sem política" (INFO)** — **intencional**: acesso exclusivo via servidor (service_role). É o desenho.
  - 1× **`pg_net` no schema `public` (WARN)** — extensão usada só pelo cron interno (chamadas `net.http_post` são schema-qualificadas, não dependem do lugar da extensão). Sem exposição a `anon`. **Aceito** (mover arrisca quebrar o cron, ganho nulo num sistema de 1 usuário).
  - 1× **"Leaked Password Protection desligada" (WARN)** — checagem de senha vazada (HaveIBeenPwned) no login. Opcional, 1 clique no painel: **Supabase → Authentication → Policies → Password → "Leaked password protection"**. Baixa prioridade (1 usuário, senha forte). Deixei a seu critério.

### Backups
- **Banco:** Supabase faz **backup diário automático** do Postgres no plano gratuito (gerenciado pela plataforma; PITR/restauração ponto-a-ponto é recurso pago — não necessário agora).
- **Schema:** 100% reprodutível pelas **migrations versionadas** em `supabase/migrations/` (0001→0014). Recriar o banco do zero = aplicar as migrations.
- **Segredos:** fora do git (`.env*` no `.gitignore`); na Vercel (production) e no Supabase Vault (cron). Guarde uma cópia sua dos tokens em lugar seguro.

### Dívidas da Fase 1 endereçadas aqui
- Rate limiting no `/collect` → **feito**.
- Nome neutro do script/endpoint vs ad-block → **não alterado** (decisão: `t.js`/`/api/collect` já são neutros; renomear quebraria as instalações já no funil sem ganho real). Anotado caso ad-block vire problema medível.

---

## Fase V2-0 — Config base (produtos + campanhas por tag + retenção) ✅

> Objetivo: criar a base de configuração da v2 — quais **produtos** entram no dash (com papel), qual **tag** filtra as campanhas do "investido", e a **retenção**. Só config; nada de automação.

### Feito
- [x] **Migration `0015_products_tracking_config.sql`** (100% aditiva): cria `products` e `tracking_config`. RLS ligado **sem política** (padrão v1). Nenhuma função nova (nada de search_path a fixar). Não toca em `orders`/`visitors`/`touchpoints`.
  - `products`: `product_id` (PK, id Hotmart), `name`, `role` (check `principal/order_bump/upsell/downsell/other`, default `other`), `included` (bool default false), `created_at`, `updated_at`.
  - `tracking_config` (single-row, `id=1`): `campaign_name_tags` (text[]), `retention_days` (int default **90**, check > 0), `updated_at`.
- [x] **Seed dos 15 produtos reais** já vistos em `orders` (nomes do `raw_payload`), idempotente (`ON CONFLICT DO NOTHING` → não sobrescreve edições feitas na tela). Pré-marcados como **incluídos**: `7715052` Imersão Geografia da Voz (**principal**) e `7716106` Gravação da Imersão (**order_bump**). Os outros 13 ficam `included=false`/`other`.
- [x] **Tela `/configuracoes`** (atrás do login, mesmo design system do dashboard): liga/desliga produtos + escolhe papel (salva sozinho); campo de texto pra digitar a(s) **tag(s)** de campanha (uma por linha; filtro = campanha cujo nome **contém** a tag); campo de **retenção** (dias). Link "⚙️ Configurações" no topo do dashboard.
  - Leitura via `lib/config-store.ts` (admin/service_role, server-only). Gravação via server actions (`app/configuracoes/actions.ts`) que recheca login antes de escrever.
- [x] **Decisão da tag (confirmada com o usuário):** campo de texto livre que ele mesmo escreve; só campanhas com a tag no nome entram no "investido"/ROAS. O **match** de fato (nome contém tag) será aplicado na camada de leitura nas Fases V2-3+.
- [x] **Retenção baixa por padrão (90 dias)** para ficar no plano gratuito. A poda só liga na **V2-7**; aqui apenas guardamos o número. Vendas (`orders`) e agregados diários **nunca** são podados.

### Divergências anotadas
- A skill **frontend-design** (pedida pela arquitetura) **não está disponível neste ambiente** → a tela foi feita no design system já existente do dashboard, para manter consistência. Reaplicar a skill quando disponível.
- Produção tem **15 produtos de nichos diferentes** (voz, criativos, coluna, sensualidade, música, comunidade), bem mais do que a arquitetura sugeria. O registry (`products.included`) resolve isso: o usuário liga só o que quer. Sem conflito com o desenho.

### DoD — ✅
- [x] `products` e `tracking_config` criadas com **RLS ligado e sem política** (advisor de segurança: **0 erros**; só os INFO "RLS sem política" intencionais).
- [x] 15 produtos no registry; Imersão = `principal`/incluído e Gravação = `order_bump`/incluído; resto `included=false`.
- [x] `tracking_config` com 1 linha; `retention_days=90`; tags começam vazias.
- [x] Gravação/persistência validada com round-trip no banco (editar → ler → restaurar ao seed).
- [x] `npm run lint` e `npm run build` limpos.
- [ ] **Deploy na Vercel** — pendente (aguarda "ok" separado; a tela só aparece no ar após o deploy).

---

## Fase V2-1 — Atribuição ampliada (sinais + comprador + enriquecimento) ✅ (código)

> Objetivo: capturar mais sinais do visitante (IP/geo/device/UA/fbp/fbc), gravar produto + comprador crus na venda e ligar comprador↔visitante. Só captura/armazena; nada de automação.

### Feito
- [x] **Migration `0016_v2_signals_buyer.sql`** (aditiva, aplicada): colunas novas em `visitors` (`ip`, `geo_country`, `geo_region`, `geo_city`, `user_agent`, `device_type`, `fbp`, `fbc`) e `orders` (`product_id`, `buyer_email/name/phone/document`, `buyer_address` jsonb) + índices `product_id`/`buyer_email`. Sem FK rígida em `product_id` (elo lógico — venda nunca falha por produto não cadastrado). PII crua protegida por RLS já existente.
- [x] **`public/t.js`**: lê os cookies do Meta `_fbp`/`_fbc` (quando o pixel está na página) e envia no payload. Mantém DNT, visitor_id 24-hex, injeção de `src`.
- [x] **`/api/collect`**: deriva `device_type` do user-agent; pega **IP + geo dos headers** (`x-vercel-ip-*` em produção; `x-forwarded-for`/`x-real-ip` p/ IP); aceita `fbp`/`fbc`. Grava os sinais no visitante **só quando presentes** (não apaga com null) e preserva `first_touch`. Mantém rate limit + allow-list anti-PII.
- [x] **`lib/sales/hotmart.ts`**: parser estendido — `productId` (`data.product.id`), `buyerName`, `buyerDocument`, `buyerAddress` (jsonb), além de email/telefone que já vinham. **Caminhos confirmados contra payloads reais** (`product.id/name`, `buyer.email/name/document/phone/address` com `city,state,zipcode,...`).
- [x] **`app/api/webhook/hotmart`**: após a RPC (que já grava a venda), faz um **UPDATE best-effort** gravando `product_id` + comprador crus (só campos não-nulos) e **associa o contato (hash) ao visitante casado** (`visitors.contact_hash`, só quando nulo) — isso **ativa o fallback cross-device** para vendas futuras. O enriquecimento é isolado em try/catch: **nunca derruba o webhook** (a venda já está gravada).
- [x] **Atribuição 3 níveis:** o `touchpoint`/`origin` JSON já carrega campanha (nome), conjunto (`utm_term`) e criativo (`utm_content`). Campanha e criativo já resolvem (v1). A resolução do **conjunto por ID** (`utm_term`→`adsets.meta_id`) é um join de leitura que entra na **V2-3** (camada de dados). Reembolso herda a atribuição (já funcionava).

### Validação
- [x] `lint` + `build` limpos.
- [x] Migration aditiva aplicada **sem alterar dado real** (14 colunas confirmadas).
- [x] Parser validado contra payloads reais (presença de produto/comprador/endereço, sem expor PII).
- [x] **Round-trip sintético** (visitante + venda fake) provou que sinais, produto, comprador e `contact_hash` caem nas colunas certas — dados de teste removidos no fim.
- [ ] **Validação ao vivo** (visita real gravando geo/fbp; webhook real gravando comprador): só no **deploy do marco** (geo só existe em produção na Vercel). Código pronto e validado offline.

### Notas / decisões
- **UA e geo no servidor** (headers da Vercel) em vez de no client: mais confiável e **sem dependência nova nem segredo** (evita lib de GeoIP).
- **Comprador↔visitante** via `orders.visitor_id` + `orders.buyer_email` (não dupliquei e-mail cru em `visitors`); o `contact_hash` no visitante é o que ativa o match cross-device futuro.
- **Conjunto por ID** depende de o Meta mandar `utm_term={{adset.id}}` nos parâmetros de URL do anúncio (hoje a convenção usa nome em `utm_campaign` e slug em `utm_content`). O código lida quando existir; configurar no Meta quando quiser ligar o nível de conjunto.

---

## Fase V2-2 — Sync do Meta ampliado (vídeo + status) ✅ (código)

> Objetivo: puxar métricas de vídeo + cliques de link + veiculação (effective_status), além do que a v1 já trazia. Reaproveita 100% da resiliência (retry/backoff/lock/paginação).

### Feito
- [x] **Migration `0017_meta_video_status.sql`** (aditiva, aplicada): `meta_insights_daily` ganhou `video_3s`, `video_p75`, `video_p95`, `video_plays` (default 0); `campaigns`/`adsets`/`ads` ganharam `effective_status`. `link_clicks` já existia desde a 0001.
- [x] **`lib/meta/client.ts`**: `fetchInsights` agora pede os campos de vídeo (`video_3_sec_watched_actions`, `video_p75/p95_watched_actions`, `video_play_actions`); novo `fetchEntityStatuses(level)` busca `effective_status` por nível (endpoint separado — status não vem nos insights); helper `extractMetric()` soma o valor das actions de vídeo (prefere janela `7d_click`).
- [x] **`lib/meta/sync.ts`**: busca os 3 mapas de status em paralelo; grava `effective_status` no upsert da hierarquia (campanha/conjunto/anúncio) e as 4 métricas de vídeo em `meta_insights_daily`. Idempotente (mesmos upserts por chave única). Lock/retry/cron inalterados.

### Validação
- [x] `lint` + `build` limpos; migration aditiva aplicada (5 colunas em insights + status nos 3 níveis confirmadas).
- [x] Nomes dos campos da Graph API v25 conferem (vídeo + `effective_status`).
- [ ] **Sync ao vivo** (vídeo/status realmente populando): só no **deploy do marco** — o token do Meta está só na Vercel (não no ambiente local). O cron 6h passa a trazer os campos novos automaticamente após o deploy.

---

## Fase V2-3 — Camada de dados (funções de dashboard) 🔄 em andamento

> Objetivo: funções de leitura para as 3 telas, líquido + coorte + fuso SP, escopadas por produtos incluídos (faturamento) e campanhas por tag (investido). search_path fixo; revogadas de anon/authenticated.

### Etapa 1 — Tela Central ✅ (migration `0018`)
- [x] **`central_summary(from,to)`**: cabeça completa (investido, faturamento, lucro, ROAS, CAC total/principal, ticket, taxa de reembolso nº/valor, nº vendas total/principal) + **faturamento por papel** + funil (connect/ida ao checkout/conv checkout/conv funil). Fallback de usabilidade: sem tag = todas as campanhas; sem produto incluído = todos.
- [x] **`central_timeseries(from,to)`**: diário (gasto, faturamento, lucro, ROAS) no mesmo escopo.
- [x] **Validado com dados reais** (jun/2026, 2 produtos incluídos):
  - `net_revenue` 6587,23 = principal 5508,12 + order_bump 1079,11 → **Σ papéis = total** ✅
  - gross−refunded = net ✅; ROAS/CAC/ticket/taxa de reembolso conferem na conta ✅
  - **Filtro por tag funciona**: `[GEO-VOZ-02]` derruba o investido (14.514 → 12.900, tira `[CP]`/`[WWA]`) e escopa os eventos do funil; faturamento dos incluídos inalterado.
- ⚠️ **Achado real (não é bug):** `checkout_conv` pode dar **>1** porque o rastreio ainda é **parcial** (poucos eventos `checkout_iniciado` vs muitas vendas reais do webhook) e, com tag vazia, investido/eventos = conta toda enquanto faturamento = só incluídos. Alinha quando: (a) a tag for setada e (b) o `t.js` cobrir mais páginas do funil. As métricas financeiras não são afetadas.

### Etapa 2 — Origem + Clientes ✅ (migration `0019`)
- [x] **`origem_overview(from,to)`**: rastreadas vs não rastreadas, por classe (organic/paid_meta/...), por source/medium. Validado: **rastreadas (7) + não rastreadas (120) = 127 = total**; net bate com a Central. Achado real: só 7/127 vendas do Geografia estão atribuídas (rastreio parcial).
- [x] **`customers_list(from,to)`** + **`customer_history(email)`**: 1 linha por e-mail. Validado: 151 compras → **137 clientes únicos** (12 recorrentes); consolidação por e-mail correta.

### Etapa 3 — Campanhas ✅ (migration `0020`)
- [x] **`campaigns_table(level, parent_id, from, to)`**: estilo gerenciador, filtrável por nível (campaign/adset/creative) + drill-down por `parent_id`. Retorna agregados-base por entidade (gasto, faturamento atribuído, compras total/principal, reembolso por origem, impressões, cliques, vídeo 3s/p75/p95/plays, pageviews, checkouts) — a tela calcula os ratios da §7. Validado: gasto idêntico nos 3 níveis (R$ 12.900 = escopo da tag); 30 conjuntos, 85 anúncios.
- [x] **`creatives_consolidated(from, to)`**: por NOME de criativo across campanhas. Validado: 85 anúncios → 22 criativos; faturamento R$ 291 = as 7 vendas rastreadas.
- Mapeamento venda→entidade: ad_id OU origin (utm_content→anúncio, utm_term→conjunto, utm_campaign→campanha). Funil por dimensão de UTM do touchpoint.

**Camada de dados (V2-3) — completa.** Falta a tela Campanhas (V2-6) e a retenção (V2-7).

---

## Fase V2-4 — Front-end: Tela Central ✅ (construída)

> Fatia vertical: como a camada de dados da Central ficou pronta (V2-3 p1), construímos a tela já, pra virar o primeiro marco publicável.

### Feito
- [x] **Rota `/central`** (atrás do login, mesmo design system): cartões (Investido, Faturamento, Lucro, ROAS, Ticket, Custo/venda total e principal, Taxa de reembolso, Nº vendas total e principal) + **faturamento por papel** (com % de cada) + **funil** (connect/ida ao checkout/conv checkout/conv funil) + **gráfico temporal** + **reembolso**.
- [x] **`lib/central.ts`** (server-only): chama `central_summary`/`central_timeseries` via service_role + lê o escopo atual (produtos incluídos + tags). `resolveRange` (preset 7/14/30/90 ou intervalo livre).
- [x] **Filtro de data persistente** (`date-filter.tsx`) via URL — base do "filtros persistem entre telas". Escopo de produto/campanha vem da config (`/configuracoes`), mostrado no cabeçalho com link pra editar.
- [x] **Gráfico temporal** (`timeseries-chart.tsx`): SVG próprio, **sem dependência nova** — 4 séries (gasto/faturamento/lucro no eixo R$ + ROAS no eixo secundário), gridlines, legenda.
- [x] Link "Central (v2)" no topo do dashboard v1; `lint` + `build` limpos.
- [ ] **Validação visual** (§8.1): no deploy do marco (preview local quebra com Turbopack+nvm, como na v1).

---

## Fase V2-7 — Retenção + endurecimento ✅

> Objetivo: podar eventos brutos antigos (manter o plano grátis) sem perder vendas/agregados. Última fase da V2.

### Feito
- [x] **Migration `0021`**: função `prune_raw_events()` (search_path fixo) apaga `tracking_events`/`touchpoints` mais velhos que `tracking_config.retention_days`. **Nunca** toca em `orders`, `meta_insights_daily` (agregados) nem `visitors`. Atribuição usa janela 7d + snapshot em `attributions.origin`, então podar toques antigos não afeta vendas/atribuições.
- [x] **Cron diário** (`prune-raw-events`, 05:17 UTC) via pg_cron, ao lado do `meta-sync-6h`.
- [x] **Validado:** rodei a poda → **0 apagados** (tudo é de junho, < 90d); dados intactos (351 eventos, 294 touchpoints, 437 orders). Roda em segurança.
- [x] **Advisors de segurança: 0 erros** (só INFO "RLS sem política" intencional + 2 WARN pré-existentes pg_net/leaked-password). Nenhuma função com `search_path` mutável.

---

## ✅ V2 COMPLETA (Fases V2-0 → V2-7)

Todas as fases concluídas e **no ar** (rastreamento-utm.vercel.app, região São Paulo, deploy automático no merge da main):
- **V2-0** config (produtos + tag + retenção) · **V2-1** sinais + comprador · **V2-2** sync Meta vídeo/status · **V2-3** camada de dados · **V2-4/5/6** telas Central/Origem/Campanhas · **V2-7** poda.
- Migrations 0015→0021. V2 é o padrão; v1 escondida em `/v1`.
- **Pendência leve:** clicar "Atualizar Meta" 1x para re-sincronizar o vídeo com os valores corrigidos (o último sync foi antes do fix).

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
