# Google Ads MCP — instalação e uso

Servidor MCP oficial do Google (`googleads/google-ads-mcp`) que dá ao Claude Code
acesso **somente leitura** à Google Ads API: listar contas, consultar campanhas e
métricas por GAQL, e ler metadados da API.

> **Escopo:** ferramenta de *desenvolvimento*. Não faz parte do app em produção,
> não entra no build da Vercel e não toca no banco Supabase. É só o Claude
> conseguindo consultar sua conta do Google Ads enquanto trabalhamos.

---

## O que fica disponível

**Tools**

| Tool | O que faz |
| --- | --- |
| `customers_list_accessible_customers` | Lista os IDs de conta que suas credenciais alcançam |
| `search_search` | Roda uma query GAQL (campanhas, anúncios, métricas…) |
| `metadata_get_resource_metadata` | Descreve os campos de um recurso (ex.: `campaign`) |

**Resources:** `discovery-document`, `metrics`, `segments`, `release-notes`.

---

## Passo 1 — instalar o `uv`

O servidor é Python. O `uv` cuida de tudo (baixa o Python certo e as dependências
sozinho); você não precisa mexer em virtualenv.

```shell
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Feche e reabra o terminal, depois confirme:

```shell
uvx --version
```

Não é preciso instalar o servidor à mão: o `uvx` baixa e roda direto do GitHub na
primeira vez que o Claude Code sobe o MCP (leva ~1 min só na primeira).

---

## Passo 2 — pegar o Developer Token

No [API Center](https://developers.google.com/google-ads/api/docs/get-started/dev-token)
da sua conta de gerenciador (MCC) do Google Ads.

O token precisa de nível **Explorer** ou superior para consultar contas de
produção. Se aparecer o erro *"The developer token is only approved for use with
test accounts"*, o token ainda está em Test — dá para pedir upgrade no próprio
API Center.

---

## Passo 3 — habilitar a Google Ads API no Google Cloud

No projeto do Google Cloud que você vai usar,
[ative a Google Ads API](https://console.cloud.google.com/apis/library/googleads.googleapis.com).

---

## Passo 4 — autenticar (ADC)

O servidor usa **Application Default Credentials**. Instale o
[gcloud CLI](https://cloud.google.com/sdk/docs/install) e rode:

```shell
gcloud auth application-default login \
  --scopes https://www.googleapis.com/auth/adwords,https://www.googleapis.com/auth/cloud-platform
```

Faça login com a conta Google que **tem acesso ao Google Ads**. O gcloud salva o
arquivo de credenciais no caminho padrão (`~/.config/gcloud/…`) e o servidor
acha sozinho — não precisa configurar nenhum caminho.

---

## Passo 5 — exportar as variáveis

O `.mcp.json` na raiz do projeto **não guarda segredos**: ele lê as variáveis do
seu shell. Adicione no fim do `~/.zshrc`:

```shell
export GOOGLE_ADS_DEVELOPER_TOKEN="seu-developer-token"
export GOOGLE_PROJECT_ID="seu-projeto-google-cloud"
# Só se o acesso à conta de anúncios for via conta de gerenciador (MCC):
export GOOGLE_ADS_LOGIN_CUSTOMER_ID="1234567890"
```

Depois recarregue:

```shell
source ~/.zshrc
```

> `GOOGLE_ADS_DEVELOPER_TOKEN` é **obrigatória**. Sem ela o Claude Code não
> consegue subir o servidor. As outras duas são opcionais.

---

## Passo 6 — usar

Abra o Claude Code na pasta do projeto. Ele detecta o `.mcp.json` e pede
aprovação para o servidor `google-ads` na primeira vez — aceite.

Para conferir:

```
/mcp
```

O `google-ads` deve aparecer como **connected**. Aí é só perguntar:

- `quais contas do Google Ads eu tenho acesso?`
- `quantas campanhas ativas eu tenho na conta 1234567890?`
- `como está a performance das minhas campanhas nos últimos 7 dias?`

O agente costuma precisar do **customer ID**; incluir na pergunta acelera.

---

## Segurança

- O `.mcp.json` versionado usa `${VARIAVEL}` — **nenhum token vai para o Git**.
- As credenciais ADC ficam só na sua máquina, fora do repositório.
- As tools expostas são de **leitura**. O servidor não altera campanhas nem
  orçamentos.
- O servidor expõe dados da sua conta de anúncios ao modelo — vale o mesmo
  cuidado das outras integrações.
- O Google adiciona um header de telemetria de uso nas chamadas à API.

---

## Se der problema

| Sintoma | Causa provável |
| --- | --- |
| Servidor não aparece no `/mcp` | `uvx` não está no PATH — reabra o terminal depois de instalar o `uv` |
| "GOOGLE_ADS_DEVELOPER_TOKEN environment variable not set" | A variável não foi exportada no shell que abriu o Claude Code |
| "developer token is only approved for use with test accounts" | Token ainda em nível Test — peça Explorer no API Center |
| Erro de autenticação / permissão | Refaça o Passo 4 com a conta Google que tem acesso ao Google Ads |
| "customer not found" via MCC | Falta exportar `GOOGLE_ADS_LOGIN_CUSTOMER_ID` |

Repositório oficial: <https://github.com/googleads/google-ads-mcp>
