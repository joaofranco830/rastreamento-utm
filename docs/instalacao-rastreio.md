# Instalação do rastreio (t.js) no funil

O script de rastreio já está publicado em produção. Para começar a capturar visitantes,
cliques e ligar tudo às vendas, **cole o snippet abaixo em TODAS as páginas do funil**
(landing, página de vendas, upsell, obrigado) — logo antes de `</body>`.

## Snippet (copiar e colar)

```html
<script
  src="https://rastreamento-utm.vercel.app/t.js"
  data-endpoint="https://rastreamento-utm.vercel.app/api/collect"
  data-hotmart-hosts="hotmart.com"
  data-checkout-url="pay.hotmart.com,/checkout,/comprar"
  async></script>
```

- `async` = não trava o carregamento da página.
- Funciona em qualquer site (Builder da Hotmart, WordPress, ClickFunnels, página estática etc.).
- O script gera um `visitor_id`, captura UTMs/`fbclid` e **injeta o `src` (visitor_id) nos links de checkout da Hotmart** automaticamente.

## Como os links de anúncio devem vir (UTMs)

Para o tráfego pago casar com o anúncio certo, use UTMs nos links dos anúncios. No
**Meta Ads Manager**, no campo **"Parâmetros de URL"** do anúncio, use:

```
utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.id}}&utm_term={{adset.id}}
```

> O `{{ad.id}}` em `utm_content` é o que liga a venda ao anúncio na Fase 4 (já preparado).
> Use **IDs** (não nomes), porque nomes mudam.

## Como validar que está funcionando

1. Abra uma página do funil com `?utm_source=teste&utm_campaign=instalacao` na URL.
2. O `visitor_id` é criado (cookie `fa_vid`). Recarregar mantém o mesmo id.
3. Passe o mouse num botão de checkout Hotmart: o link deve ter `&src=<seu-visitor_id>`.
4. (Opcional) me avise que eu confiro no banco o visitante + touchpoint chegando.

## A confirmar na 1ª venda real rastreada

O teste da Hotmart não traz parâmetros de rastreio, então o caminho exato onde o `src`
volta no webhook só será confirmado numa **venda real com link rastreado**. Quando a
primeira acontecer, eu inspeciono o `raw_payload` dela e, se preciso, ajusto o parser e
reprocesso a atribuição — **sem perder nada** (tudo fica guardado).
