# PROGRESSO — Sistema de Rastreamento por UTM

> Registro do que já foi feito e do que falta. Atualizado a cada passo.
> Fonte de verdade do desenho: `arquitetura-rastreamento-utm-v1.md`.

---

## Visão geral das fases

| Fase | Tema | Status |
|---|---|---|
| 0 | Fundação | 🟡 em andamento |
| 1 | Rastreio (script + ingestão) | ⏳ não iniciada |
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
- **Supabase rodando LOCAL** (Docker). Nada de nuvem/deploy nesta fase.
- Segurança: **RLS ligado em todas as tabelas, sem políticas públicas** → acesso só pelo servidor.

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

### Falta para fechar a Fase 0
- [ ] Instalar **Docker Desktop** (precisa da senha do Mac).
- [ ] `supabase start` (sobe Postgres + Auth local).
- [ ] Aplicar a migration no banco local.
- [ ] Criar o usuário (você) e **testar o login de ponta a ponta**.
- [ ] Rodar `npm run dev` e abrir no navegador.

### Definição de pronto (DoD)
- [ ] App roda em `localhost` e abre sem erro.
- [ ] Todas as tabelas criadas via migration versionada.
- [ ] Login funciona; rota protegida exige sessão.
- [ ] Timezone e janela de 7 dias fixados em config.
- [ ] `.env` ignorado; nenhum segredo commitado.
- [ ] Commits pequenos feitos.
- [ ] Nada de nuvem/deploy (fica para quando autorizado).

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
