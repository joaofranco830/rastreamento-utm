# VTurb — leitura de dados e plano de integração

> Contexto persistente sobre como o **VTurb** (player de VSL) passa dados pelo
> checkout da Hotmart, como o **nosso sistema** lê isso hoje, e o plano para a
> futura integração via **API de Analytics do VTurb**.

## 1. Como o VTurb passa os dados no checkout Hotmart

Confirmado na documentação oficial do VTurb (Rastreamento de Conversões / Hotmart)
e da UTMify. No checkout da Hotmart os três "slots" de rastreio têm papéis fixos:

| Campo   | Dono   | Conteúdo                                                                 |
|---------|--------|--------------------------------------------------------------------------|
| `xcod`  | VTurb  | **Chave de conversão do FRONT.** Formato `v3_<uuid>_<hex>_<n>_h-N_s-1`. NÃO são UTMs — é o identificador que liga a sessão do vídeo à venda. |
| `sck`   | VTurb  | Rastreio de **UPSELL** (e/ou `fbclid`/`fbp` do Facebook). NÃO são UTMs.   |
| `src`   | livre  | **É onde viajam as UTMs** (UTMify/manual), empacotadas com `\|`.          |

Formato do `src` (o que os pedidos do Franco Advertising trazem):

```
utm_source | utm_campaign | utm_medium | utm_content | utm_term | utm_id
```

Exemplo real:
`Instagram_Reels|[VEN][SVC][AD0036 - PUBLICO 100% FRIO] 26/07/26 (JF)|pago_meta|svc-ad0036|ADV (EXCLUINDO AUDIENCIA)|SVC`

Decomposição do `xcod` (chave de conversão do VTurb):
`v3` = versão · `<uuid>` = sessão/pageview do vídeo · `<hex 24>` = id do vídeo/VSL
(há poucos distintos) · `<n>` = variante/métrica · `h-N`/`s-1` = flags do player.

## 2. Como o NOSSO sistema lê (hoje)

- `attribute_order` (SQL) → `inline_origin_json` → `parse_src_utms`.
- Lê UTMs de: (1) chaves separadas `utm_*` em `origin`/`tracking` (se um dia
  vierem soltas); (2) do `src` empacotado. **Nunca** de `xcod`/`sck`.
- `xcod` e `sck` ficam **intactos** (são do VTurb) — os dois sistemas convivem
  sem um atrapalhar o outro. Migrations `0045`/`0046`.
- Resultado: as UTMs do VTurb/UTMify (no `src`) entram em Origem, Campanhas e
  Clientes normalmente. `resolve_attribution_ads` liga ao anúncio por
  `utm_content` (= nome do anúncio, ex. `svc-ad0036`).

## 3. Plano — integração via API de Analytics do VTurb (futuro)

Objetivo: puxar do VTurb, pela chave de conversão (`xcod`), dados que só existem
lá — UTMs completas (quando não vierem no `src`), tempo de retenção do vídeo,
engajamento, etc. — e cruzar com a venda.

Passos previstos (a detalhar quando formos implementar):
1. Guardar a chave de conversão do `xcod` por pedido (já está no `raw_payload`;
   extrair para uma coluna/consulta dedicada).
2. Autenticar na API de Analytics do VTurb (token da conta — vai para o cofre de
   credenciais por projeto, nunca no client).
3. Consultar por sessão/vídeo/conversão e mapear os campos retornados para o
   nosso `attributions.origin` (ou uma tabela `vturb_events`).
4. Sync agendado (como o do Meta) + on-demand.

> Doc da API: https://vturb.gitbook.io/analytics-api/pt — **não foi possível
> abrir deste ambiente** (bloqueio de egress da rede). Quando formos integrar,
> capturar endpoints/auth/campos a partir dessa doc (ou colar o conteúdo aqui).

## Fontes
- VTurb — Rastreamento de Conversões: https://help.vturb.com/pt-br/article/rastreamento-de-conversoes-1ms9vqq/
- VTurb — Rastreando a Conversão (Hotmart): https://help.vturb.com/pt-br/article/rastreando-a-conversao-hotmart-1kgz7ce/
- VTurb — Como usar parâmetros de URL: https://help.vturb.com/pt-br/article/como-usar-parametros-de-url-no-vturb-1y1cuzy/
- VTurb — Analytics API: https://vturb.gitbook.io/analytics-api/pt
- UTMify — soluções de trackeamento: https://utmify.help.center/article/1024-possiveis-solucoes-para-o-problema-de-trackeamento-de-vendas
