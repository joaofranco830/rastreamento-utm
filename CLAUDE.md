# CLAUDE.md — Sistema de Rastreamento por UTM

> Este é o **briefing persistente** do projeto. Você (Claude) lê este arquivo em toda sessão.
> A **fonte de verdade do desenho** é o arquivo `arquitetura-rastreamento-utm-v1.md` (versão 1.1). Em qualquer conflito entre este briefing e a arquitetura, **a arquitetura prevalece** — e me avise da divergência.

---

## 1. O que estamos construindo

Uma ferramenta própria de rastreamento por UTM para funis de tráfego direto de infoprodutos. Ela liga o **clique no anúncio (UTM) → page view → checkout → compra** usando um script de rastreio próprio, integra com o **Meta Ads** (métricas de anúncio) e com a **Hotmart via Webhook 2.0** (vendas/reembolsos como fonte de verdade do faturamento), e apresenta tudo num **dashboard** com métricas centrais (investido, vendas líquidas, faturamento líquido, ROAS), métricas de funil e reconciliação "nosso rastreio × Meta". Detalhe completo na arquitetura.

Uso inicial: apenas eu (single-user). Multi-usuário é v2.

---

## 2. Stack (decidida — não trocar sem me perguntar)

- **App (front + back):** Next.js (App Router) — funciona como monólito modular, módulos por domínio.
- **Banco + Auth:** Supabase (Postgres + Auth + Edge Functions + Cron).
- **Deploy:** Vercel.
- **Script de rastreio:** JS vanilla minúsculo, servido da edge/CDN.
- **Integrações:** Meta Marketing API (server-side) e Hotmart Webhook 2.0.
- Sem Docker/Kubernetes nesta v1.

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
- **Construa FASE POR FASE** (Fase 0 → 6 da arquitetura). **Não pule fases** nem adiante features de v2.
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
arquitetura-rastreamento-utm-v1.md  # desenho (fonte de verdade)
```

---

## 6. Convenções

- **TypeScript** no app; código e nomes técnicos em inglês, comentários podem ser em português.
- **Migrations versionadas** no Supabase; **nunca** alterar schema "na mão" em produção.
- **Idempotência + validação de assinatura** em todo webhook.
- **Datas/fuso:** fixar o timezone do negócio; janela de atribuição = 7 dias.
- **Testar o caminho crítico** (atribuição determinística, idempotência do webhook, cálculo líquido com reembolso) **antes** de marcar uma fase como pronta.
- Nada de `localStorage`/segredos no client além do `visitor_id` (que é não sensível).

---

## 7. Comandos (preencher conforme o projeto nasce)

- Dev: `TODO`
- Build: `TODO`
- Testes: `TODO`
- Lint/format: `TODO`
- Migrations: `TODO`
- Deploy: `TODO`

---

## 8. Decisões fixadas e o que está adiado

**Fixado (v1):** last-click janela 7 dias · ROAS = "lucro dos anúncios" · `visitor_id` carregado no `src` da Hotmart · sync do Meta = 6h deslogado + fetch no login + 30 min logado (aba ativa) + botão refresh · 1 conta de anúncio.

**Adiado para v2 (NÃO implementar agora, mas preparar quando indicado):**
- **Jornada do cliente** (first touch → caminho → conversão) — **mas já gravar a tabela `touchpoints` desde a Fase 1**, para não perder dado.
- **Modelo de custo/lucro monetário** (COGS, taxas, impostos).
- **Multi-usuário / multi-cliente**, alertas, automações, outras fontes (Google/TikTok), API pública.

---

## 9. A validar logo no início (sandbox Hotmart)

Antes de fechar a Fase 3 (atribuição), confirmar no ambiente de testes da Hotmart:
- comprimento máximo real e tratamento de caixa (maiúscula/minúscula) do `src`/`sck`;
- forma e nomes exatos dos campos do objeto `origin` no payload do Webhook 2.0 na minha conta.

Se algo divergir do previsto, ajustar o formato do `visitor_id` e me avisar.
