# PROGRESSO — Sistema de Rastreamento por UTM

> Registro do que já foi feito e do que falta. Atualizado a cada passo.
> Fonte de verdade do desenho: `arquitetura-rastreamento-utm-v1.md`.

---

## Visão geral das fases

| Fase | Tema | Status |
|---|---|---|
| 0 | Fundação | ✅ concluída |
| 1 | Rastreio (script + ingestão) | ✅ concluída |
| 2 | Vendas + reembolsos (webhook Hotmart) | ⏳ não iniciada |
| 3 | Atribuição (o coração) | ⏳ não iniciada |
| 4 | Integração Meta | ⏳ não iniciada |
| 5 | Dashboard | ⏳ não iniciada |
| 6 | Endurecimento | ⏳ não iniciada |

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

## Descobertas / a validar (carregado da arquitetura)
- **Sandbox Hotmart** (antes da Fase 3): confirmar comprimento e caixa de `src`/`sck` e a forma exata do objeto `origin`.
- **Reembolso parcial**: reduz faturamento, mantém conversão (padrão adotado).
- **Restatement por coorte**: estorno deduz da data/origem da venda original (padrão adotado).

---

## Ideias de v2 (NÃO implementar agora — só anotar)
- Jornada do cliente (first touch → caminho → conversão) — dados já capturados em `touchpoints`.
- Modelo de custo/lucro monetário (COGS, taxas, impostos).
- Multi-usuário, alertas, automações, Google/TikTok, API pública.
