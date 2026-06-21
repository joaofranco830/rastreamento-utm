# CLAUDE.md — Sistema de Rastreamento por UTM

> Este é o **briefing persistente** do projeto. Você (Claude) lê este arquivo em toda sessão.
> **Fonte de verdade do desenho:**
> - **v1 (base, concluída e no ar):** `arquitetura-rastreamento-utm-v1.md` (versão 1.1).
> - **v2 (concluída e no ar):** `arquitetura-rastreamento-utm-v2.md` — estendeu a v1 (migrations aditivas 0015→0021, mesma stack). Fases V2-0→V2-7 concluídas.
> - **v3 (em planejamento):** a arquitetura será criada por IA de planejamento; ainda não existe doc. Escopo candidato em §8 ("adiado para v3+").
> Em qualquer conflito entre este briefing e a arquitetura vigente, **a arquitetura prevalece** — e me avise da divergência.

---

## 1. O que estamos construindo

Uma ferramenta própria de rastreamento por UTM para funis de tráfego direto de infoprodutos. Ela liga o **clique no anúncio (UTM) → page view → checkout → compra** usando um script de rastreio próprio, integra com o **Meta Ads** (métricas de anúncio) e com a **Hotmart via Webhook 2.0** (vendas/reembolsos como fonte de verdade do faturamento), e apresenta tudo num **dashboard** com métricas centrais (investido, vendas líquidas, faturamento líquido, ROAS), métricas de funil e reconciliação "nosso rastreio × Meta". Detalhe completo na arquitetura.

Uso: apenas eu (single-user). **Multi-usuário/SaaS é v3–v5 (fora de escopo agora).**

> **Status atual:** **v1 e v2 concluídas e em produção** (Vercel região São Paulo + Supabase + webhook Hotmart + sync Meta com vídeo/status + 3 telas novas — Central/Origem/Campanhas — + config + poda automática, **com vendas reais entrando**). Código no **GitHub (público):** https://github.com/joaofranco830/rastreamento-utm. **Próximo: planejar a v3** (ver `PROGRESSO.md` para o estado detalhado e §8 para o escopo candidato a v3+).

---

## 2. Stack (decidida — não trocar sem me perguntar)

- **App (front + back):** Next.js (App Router) — funciona como monólito modular, módulos por domínio.
- **Banco + Auth:** Supabase (Postgres + Auth + Edge Functions + Cron).
- **Deploy:** Vercel.
- **Script de rastreio:** JS vanilla minúsculo, servido da edge/CDN.
- **Integrações:** Meta Marketing API (server-side) e Hotmart Webhook 2.0.
- Sem Docker/Kubernetes (v1 e v2).

---

## 3. Regras de ouro (invioláveis)

- **Faturamento e nº de vendas vêm SEMPRE do webhook Hotmart (valor líquido), NUNCA do Meta.**
- **O dashboard lê SEMPRE da nossa base, NUNCA do Meta ao vivo** (sync agendado + cache + botão atualizar).
- **`visitor_id` deve ser curto, minúsculo e URL-safe (≤30 caracteres)** — ex.: 24 chars hex. **Nada de UUID padrão (36 chars)** nem alfabeto com maiúsculas (Hotmart limita `src`/`sck` a ~30 chars e recomenda minúsculas).
- **Webhook idempotente** (constraint `unique(transaction)`) e **validação de Hottok** obrigatórias.
- **Tudo líquido:** reembolso/chargeback/cancelamento **removem** venda + faturamento; reembolso parcial reduz o valor e mantém a conversão. A dedução é por **coorte da venda original** (restatement) e **herda a atribuição** (aparece por campanha/conjunto/criativo).
- **Segredos só no servidor.** Tokens (Meta System User, Hotmart) nunca no client; **nunca commitar `.env`**.
- **Sem over-engineering.** Neste volume: monólito modular, um Postgres. **Nada de microservices, Kafka, sharding ou NoSQL.**

---

## 4. Como trabalhar comigo

- **Sou "vibe coder":** sei o que quero, mas não sou dev experiente e não tenho fluência em terminal. **Explique decisões em linguagem simples** e me guie passo a passo.
- **Construa FASE POR FASE.** v1: Fases 0→6 (✅ concluídas). v2: **Fases V2-0 → V2-7** (arquitetura v2 §11). **Não pule fases** nem adiante features de v3+ (multi-usuário, automações, jornada completa).
- **Antes de cada fase:** mostre um plano curto + a "definição de pronto"; **espere meu OK** antes de executar.
- **PARE e peça confirmação** antes de: fazer deploy; operações destrutivas no banco (drop/delete/reset/migration destrutiva); apagar arquivos; instalar dependências pesadas; mudar a stack; mexer em segredos ou permissões.
- **Mantenha o escopo na fase atual.** Se tiver uma ideia de v2, anote, não implemente.
- **Commits pequenos e descritivos**; ao terminar um passo, resuma o que mudou.
- **Atualize a documentação:** quando descobrir algo concreto (ex.: o schema real do payload da Hotmart), registre no `PROGRESSO.md` e, se mudar uma decisão, reflita aqui no `CLAUDE.md`.

---

## 5. Estrutura do projeto (proposta — ajuste comigo na Fase 0)

```
/app            # Next.js (rotas de UI + rotas de API)
  /api
    /collect    # ingestão de eventos do script
    /webhook    # receptor Hotmart (idempotente, valida Hottok)
    /sync       # sync do Meta (on-demand)
  /(dashboard)  # telas do dashboard
/lib
  /tracking     # lógica de visitante/eventos/touchpoints
  /meta         # cliente Marketing API + sync
  /sales        # parsing de pedidos/reembolsos
  /attribution  # matching clique→venda (last-click 7d)
/public
  t.js          # script de rastreio (vanilla)
/supabase
  /migrations   # schema versionado
PROGRESSO.md    # o que já foi feito / o que falta
CLAUDE.md       # este arquivo
arquitetura-rastreamento-utm-v1.md  # desenho v1 (base concluída)
arquitetura-rastreamento-utm-v2.md  # desenho v2 (em execução — fonte de verdade vigente)
```

---

## 6. Convenções

- **TypeScript** no app; código e nomes técnicos em inglês, comentários podem ser em português.
- **Migrations versionadas** no Supabase; **nunca** alterar schema "na mão" em produção.
- **Idempotência + validação de assinatura** em todo webhook.
- **Datas/fuso:** fixar o timezone do negócio; janela de atribuição = 7 dias.
- **Testar o caminho crítico** (atribuição determinística, idempotência do webhook, cálculo líquido com reembolso) **antes** de marcar uma fase como pronta.
- No **client**, nada de segredos; `localStorage` guarda só o `visitor_id` (não sensível). **PII (v2):** dados do comprador/visitante são guardados **crus, mas só no servidor** (Postgres), protegidos por **RLS server-only** + **retenção curta** (ADR-v2-3). **Nunca** expor PII ao client.

---

## 7. Comandos

> Node é instalado via **nvm**. Em terminal novo, o nvm carrega sozinho (já está no `~/.zshrc`).

- Dev: `npm run dev` → abre em http://localhost:3000
- Build: `npm run build`
- Testes: `TODO` (a configurar nas fases com caminho crítico — Fases 2/3)
- Lint: `npm run lint`
- Migrations: arquivos em `supabase/migrations/`. Banco na nuvem (projeto `rastreamento-utm`, org FRANCO ADVERTISING, região sa-east-1). Aplicar via painel Supabase ou `npx supabase db push` quando o projeto estiver linkado.
- Deploy: **NO AR na Vercel** → https://rastreamento-utm.vercel.app (projeto `rastreamento-utm`). Webhook Hotmart + `/api/collect` em produção. Redeploy via Vercel CLI (exige token da Vercel na hora de publicar).
- GitHub: **repo público** https://github.com/joaofranco830/rastreamento-utm (remote `origin`, branch `main`). Push exige um token (PAT) gerado na hora — **não** fica salvo no `.git/config`.

---

## 8. Decisões fixadas e o que está adiado

**Fixado (v1, concluída):** last-click janela 7 dias · ROAS = "lucro dos anúncios" · `visitor_id` no `src` da Hotmart · sync do Meta = 6h (cron pg_cron) + on-demand + botão refresh · 1 conta de anúncio.

**Em execução AGORA (v2 — detalhe em `arquitetura-rastreamento-utm-v2.md`):**
- Seleção de **produtos** (registry `product_id` + papel) e **campanhas por TAG** no nome → escopo do "investido"/ROAS por produto.
- **Captura ampliada + PII crua server-side** (IP/geo/device/UA/`fbp`/`fbc` no visitante; comprador no webhook) e associação comprador↔visitante (ADR-v2-3/4).
- Atribuição em 3 níveis: campanha (nome) / conjunto (**ID** via `utm_term`) / criativo (nome).
- Sync do Meta ampliado (vídeo + `link_clicks` + `effective_status`).
- 3 telas novas (Central, Origem das UTMs, Campanhas estilo gerenciador) lendo de funções/rollups.
- Retenção 3–4 meses com poda de eventos brutos (mantém `orders` + agregados diários).
- **A v2 só MOSTRA dados** — zero automação/alerta/ação.

**Adiado para v3+ (NÃO implementar agora):**
- **Jornada do cliente** completa (first touch → caminho → conversão) — a v2 só prepara a base (`touchpoints` + view de clientes).
- **Modelo de custo/lucro monetário completo** (COGS, taxas, impostos) — v2 usa Lucro = Faturamento − Investido.
- **Multi-usuário / SaaS**, alertas, automações, outras fontes (Google/TikTok), API pública.
- Reconciliação visual Meta×nosso (ADR-v2-9) e `utm_content={{ad.id}}` (ADR-v2-5).

---

## 9. Sandbox Hotmart — ✅ JÁ VALIDADO na v1 (histórico)

> Confirmado com **venda real**: o `src` volta inalterado em `data.purchase.origin.src`; campos `src`/`sck`/`xcod` confirmados; Dash fácil (`sck`) e o nosso (`src`) convivem sem conflito. Mantido abaixo como registro.

Antes de fechar a Fase 3 (atribuição), confirmar no ambiente de testes da Hotmart:
- comprimento máximo real e tratamento de caixa (maiúscula/minúscula) do `src`/`sck`;
- forma e nomes exatos dos campos do objeto `origin` no payload do Webhook 2.0 na minha conta.

Se algo divergir do previsto, ajustar o formato do `visitor_id` e me avisar.
