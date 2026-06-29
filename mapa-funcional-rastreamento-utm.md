# Mapa Funcional — Rastreamento UTM (ferramenta interna multi-cliente)

> **Versão:** v0.1 (documento vivo) · **Data:** 28/06/2026
> **O que é:** o mapa de TUDO que a ferramenta precisa ter no estado-final, como insumo para desenhar a *arquitetura central*. **Não é** a arquitetura, **não é** um compromisso de fazer tudo agora.
> **Como será construído:** em levas (V3, V4, V5…), uma função por leva, escolhendo o foco a cada rodada — como já foi feito com a V1 e a V2.

---

## 0. Como ler este mapa

**Coberto nesta versão (v0.1):** Domínio 1 (Usuários/Papéis/Acesso), 2 (Projetos), 3 (Integrações/Ingestão), 4 (Rastreio/Leads/Jornada), 5 (Funis — 6 tipos) e as **Engines transversais**.

**Pendente para próximas rodadas:** Domínio 6 (Telas & Menus), 7 (Configurações — consolidação), 8 (Métricas — definições canônicas), 9 (Meu Negócio — custo/lucro).

**Fora de escopo (decisão do dono):** tudo de venda externa/comercial — plano, cobrança, limites de uso, add-ons, marketplace, white-label-para-venda. O conceito de **usuário/cliente permanece** apenas como unidade de isolamento interno.

**Regras de ouro herdadas (continuam valendo):** faturamento e nº de vendas sempre do webhook (líquido), nunca do anúncio; dashboard lê sempre da nossa base; `visitor_id` curto/URL-safe ≤30 chars; webhook idempotente + validação de token; tudo líquido (reembolso remove, parcial reduz, restatement por coorte, herda atribuição); segredos só no servidor; **migrations apenas aditivas**; RLS ligado; `search_path` fixo nas funções; nunca apagar/alterar dado real; sem over-engineering.

### Legenda

**Prioridade (importância relativa, não cronograma):**
- **P0** — fundação / necessário para a validação inicial **1 usuário × 1 projeto × 1 funil (perpétuo)**. Inclui o esqueleto multi-cliente que deve *funcionar mesmo sem uso inicial*.
- **P1** — núcleo do estado-final.
- **P2** — periférico / explicitamente "por último".

**Fase (balde de sequenciamento, não leva fixa):** **Base** · **Núcleo** · **Posterior** · **Último**. A leva exata (V3/V4/…) é decidida a cada rodada.

### Template da ficha

Cada item segue: **ID · Nome** → O que faz · Como faz · Como aparece · Quem acessa · Depende de · Critério de aceitação (Dado/Quando/Então) · Prioridade/Fase.

---

## 1. Hierarquia e papéis

**Hierarquia:** `Usuário → Projetos → Funis`
- **Usuário** = acesso à ferramenta; cria e acessa projetos.
- **Projeto** = "o cliente"; **fronteira de isolamento** de todos os dados (tráfego, vendas, leads). Cada cliente = um projeto.
- **Funil** = a apresentação visual dos dados; vários por projeto, inclusive vários do mesmo tipo. Cada tipo apresenta de forma diferente.

**Papéis (atribuídos por projeto):**
- **Admin** — poder total.
- **Funcionário** — acessa tudo, mas **não executa ações sensíveis**.
- **Cliente** — somente **visualização dos funis** do projeto (vê o projeto inteiro).

**Matriz de ações × papéis** (sensíveis em negrito):

| Ação | Admin | Funcionário | Cliente |
| :-- | :-: | :-: | :-: |
| Visualizar funis do projeto | Sim | Sim | Sim |
| Criar / editar funis | Sim | Sim | Não |
| Configurar fontes / integrações | Sim | Sim | Não |
| Importar CSV | Sim | Sim | Não |
| **Deletar dados** | Sim | Não | Não |
| **Desvincular contas** | Sim | Não | Não |
| **Excluir funil** | Sim | Não | Não |
| **Editar custos / lucro** | Sim | Não | Não |
| **Adicionar / remover usuários do projeto** | Sim | Não | Não |

---

## Índice de fichas

| ID | Nome | Domínio | Prioridade |
| :-- | :-- | :-- | :-: |
| USR-01 | Autenticação / login | Usuários | P0 |
| USR-02 | Papéis & permissões (RBAC) | Usuários | P0 |
| USR-03 | Gerenciar usuários | Usuários | P0 (fundação) |
| USR-04 | Atribuição usuário ↔ projeto | Usuários | P0 (fundação) |
| USR-05 | Seletor / troca de projeto | Usuários | P0 |
| PRJ-01 | CRUD de projeto | Projetos | P0 |
| PRJ-02 | Configuração do projeto | Projetos | P0 |
| PRJ-03 | Isolamento de dados (tenant) | Projetos | P0 |
| PRJ-04 | Membros do projeto | Projetos | P0 (fundação) |
| INT-01 | Conexão por OAuth "1 clique" (Meta/Google/TikTok) | Integrações | P1 |
| INT-02 | Token manual de anúncio (fallback/validação) | Integrações | P0 |
| INT-03 | Integração de checkout (webhook + Hottok) | Integrações | P0 |
| INT-04 | Cofre de credenciais por projeto | Integrações | P0 |
| INT-05 | Roteamento & validação de webhook | Integrações | P0 |
| INT-06 | Normalização de pedidos/eventos | Integrações | P0 |
| INT-07 | Importação manual via CSV | Integrações | P1 |
| INT-08 | Sync de métricas de anúncio | Integrações | P0 |
| RAS-01 | Pixel (script de rastreio) | Rastreio | P0 |
| RAS-02 | Tela de configuração do pixel | Rastreio | P0 |
| RAS-03 | Entidade Lead | Rastreio | P1 |
| RAS-04 | Identidade & resolução cross-device | Rastreio | P1 |
| RAS-05 | Jornada do cliente (linha do tempo) | Rastreio | P1 / P2 |
| RAS-06 | Retenção & poda por tenant | Rastreio | P1 |
| RAS-07 | Atribuição last-click 7d | Rastreio | P0 |
| ENG-01 | Qualificação por Pesquisa | Transversal | P1 |
| ENG-02 | Pesquisa & Formulário próprio | Transversal | P1 |
| ENG-03 | Pipeline de estágios (CRM-semente) | Transversal | P1 |
| ENG-04 | Funil de tráfego (métricas de anúncio) | Transversal | P0 |
| ENG-05 | Filtros de fonte por funil | Transversal | P0 |
| FUN-00 | Modelo genérico de funil | Funis | P0 |
| FUN-01 | Perpétuo clássico | Funis | P0 |
| FUN-02 | High Ticket | Funis | P1 |
| FUN-03 | Gestão de assinaturas | Funis | P1 |
| FUN-04 | Lançamento | Funis | P1 |
| FUN-05 | Negócios físicos | Funis | P2 |
| FUN-06 | Venda de serviço | Funis | P2 |

---

## Domínio 1 — Usuários, Papéis & Acesso

### USR-01 · Autenticação / login
- **O que faz:** controla o acesso à ferramenta.
- **Como faz:** Supabase Auth (e-mail+senha). **Você cria o login e repassa** as credenciais (sem convite por e-mail por ora).
- **Como aparece:** tela de login; sem auto-cadastro público.
- **Quem acessa:** todos (para entrar).
- **Depende de:** —
- **Critério de aceitação:** Dado um login criado pelo Admin, Quando o usuário entra com as credenciais, Então acessa apenas os projetos aos quais foi atribuído.
- **Prioridade/Fase:** P0 / Base

### USR-02 · Papéis & permissões (RBAC)
- **O que faz:** define os três papéis (Admin/Funcionário/Cliente) e o que cada um pode fazer.
- **Como faz:** papel por **par usuário↔projeto**; ações sensíveis bloqueadas para Funcionário e Cliente (ver matriz). Reforço no backend, não só na UI.
- **Como aparece:** botões/ações sensíveis ocultos ou desabilitados conforme o papel.
- **Quem acessa:** Admin define; todos sofrem o efeito.
- **Depende de:** USR-04, PRJ-03.
- **Critério de aceitação:** Dado um Funcionário, Quando tenta deletar dados / desvincular conta / excluir funil / editar custos / gerenciar usuários, Então a ação é negada (no backend, não só escondida). Dado um Cliente, Quando acessa um projeto, Então só vê funis (read-only).
- **Prioridade/Fase:** P0 / Base

### USR-03 · Gerenciar usuários
- **O que faz:** criar, editar e desativar usuários.
- **Como faz:** CRUD restrito ao Admin; criar/editar com papel atribuído.
- **Como aparece:** tela de administração de usuários.
- **Quem acessa:** Admin.
- **Depende de:** USR-01.
- **Critério de aceitação:** Dado o Admin, Quando cria/edita/desativa um usuário, Então a mudança vale no próximo acesso do usuário. *(Construído cedo; uso pode ser adiado — exigência: já funcionar.)*
- **Prioridade/Fase:** P0 (fundação) / Base

### USR-04 · Atribuição usuário ↔ projeto
- **O que faz:** liga um usuário a um ou mais projetos, com papel por projeto.
- **Como faz:** tabela de associação (usuário, projeto, papel); **adicionar/remover é ação sensível** (só Admin).
- **Como aparece:** dentro de PRJ-04 (Membros do projeto).
- **Quem acessa:** Admin.
- **Depende de:** USR-03, PRJ-01.
- **Critério de aceitação:** Dado um usuário atribuído ao projeto X como Cliente, Quando faz login, Então enxerga o projeto X (somente funis) e nenhum outro projeto.
- **Prioridade/Fase:** P0 (fundação) / Base

### USR-05 · Seletor / troca de projeto
- **O que faz:** define o **projeto ativo** (contexto) de toda a navegação.
- **Como faz:** seletor global no topo; lista só os projetos do usuário.
- **Como aparece:** dropdown fixo no cabeçalho.
- **Quem acessa:** todos (limitado aos seus projetos).
- **Depende de:** USR-04.
- **Critério de aceitação:** Dado um usuário com 2 projetos, Quando troca no seletor, Então todas as telas passam a refletir só os dados do projeto ativo.
- **Prioridade/Fase:** P0 / Base

---

## Domínio 2 — Projetos

### PRJ-01 · CRUD de projeto
- **O que faz:** criar, editar, arquivar/excluir projetos (cada projeto = um cliente).
- **Como faz:** criação simples (nome + config inicial); excluir é ação sensível.
- **Como aparece:** tela "Projetos" (cards/lista) + "+ Novo Projeto".
- **Quem acessa:** Admin cria/exclui; Funcionário edita config não-sensível.
- **Depende de:** PRJ-03.
- **Critério de aceitação:** Dado o Admin, Quando cria um projeto, Então ele nasce isolado (sem ver dados de outros) e pronto para receber fontes e funis. *(Multi-projeto deve funcionar mesmo começando com 1.)*
- **Prioridade/Fase:** P0 / Base

### PRJ-02 · Configuração do projeto
- **O que faz:** guarda os parâmetros do cliente.
- **Como faz:** campos: **nome · tag de nicho/segmento · fuso horário · moeda · retenção (dias) · credenciais por fonte (ref. INT-04) · membros (ref. PRJ-04)**.
- **Como aparece:** tela "Configurações do projeto".
- **Quem acessa:** Admin/Funcionário (credenciais e exclusões = sensível → Admin).
- **Depende de:** PRJ-01.
- **Critério de aceitação:** Dado um projeto, Quando o fuso/moeda são definidos, Então relatórios e cortes temporais usam esse fuso e a moeda do projeto.
- **Prioridade/Fase:** P0 / Base

### PRJ-03 · Isolamento de dados (tenant)
- **O que faz:** garante que dados de um projeto nunca vazem para outro.
- **Como faz:** **`tenant_id`/`project_id` em todas as tabelas de dados + RLS por projeto**; acesso via papel do usuário. (Decisão arquitetural: isolamento **lógico/pool**, não físico — adequado ao volume interno.)
- **Como aparece:** transversal (invisível ao usuário; visível como "só vejo o meu").
- **Quem acessa:** sistema.
- **Depende de:** —
- **Critério de aceitação:** Dado um usuário do projeto A, Quando qualquer consulta roda, Então é impossível retornar linha do projeto B (testado com dois projetos populados).
- **Prioridade/Fase:** P0 / Base

### PRJ-04 · Membros do projeto
- **O que faz:** lista os usuários do projeto e seus papéis; adiciona/remove.
- **Como faz:** usa USR-04; **adicionar/remover = ação sensível** (só Admin).
- **Como aparece:** aba "Membros" dentro do projeto.
- **Quem acessa:** Admin gerencia; Funcionário visualiza.
- **Depende de:** USR-04.
- **Critério de aceitação:** Dado um Funcionário, Quando tenta adicionar um Cliente ao projeto, Então é bloqueado; Dado o Admin, Quando adiciona, Então o Cliente passa a ver os funis.
- **Prioridade/Fase:** P0 (fundação) / Base

---

## Domínio 3 — Integrações & Ingestão

### INT-01 · Conexão por OAuth "1 clique" (Meta/Google/TikTok)
- **O que faz:** conectar a conta de anúncio do cliente sem colar token: clica "Integrar" → loga na plataforma → autoriza → conecta sozinho.
- **Como faz:** **OAuth**; recebemos e guardamos o token (ref. INT-04), com renovação automática. **Dependência externa:** exige nossa ferramenta aprovada como app (Meta App Review, verificação Google, acesso à Marketing API TikTok) — processo de dias a semanas, **não é só código**.
- **Como aparece:** botão "Integrar" por fonte, na config do projeto.
- **Quem acessa:** Admin/Funcionário (desvincular = sensível → Admin).
- **Depende de:** INT-04; aprovação de cada plataforma.
- **Critério de aceitação:** Dado o botão Integrar, Quando o usuário autoriza no provedor, Então a conta fica conectada e o sync (INT-08) passa a rodar sem intervenção.
- **Prioridade/Fase:** P1 / Posterior (após app review; **é uma leva própria**)

### INT-02 · Token manual de anúncio (fallback/validação)
- **O que faz:** conectar o Meta pelo token manual (o método atual).
- **Como faz:** campo para colar o token; guardado por projeto (INT-04).
- **Como aparece:** alternativa "conexão manual" na config da fonte.
- **Quem acessa:** Admin.
- **Depende de:** INT-04.
- **Critério de aceitação:** Dado um token válido, Quando salvo, Então o sync de métricas roda igual ao OAuth. *(Caminho usado na validação 1×1×1, antes do app review.)*
- **Prioridade/Fase:** P0 / Base

### INT-03 · Integração de checkout (webhook + Hottok)
- **O que faz:** conectar Hotmart/Eduzz/Kiwify de cada cliente para receber vendas automaticamente.
- **Como faz:** a plataforma **gera uma URL de webhook única por (projeto × checkout)** para colar no painel do checkout, **e solicita/armazena o Hottok do cliente** (passo obrigatório; guardado em INT-04). Validação por token na entrada.
- **Como aparece:** tela de integração do checkout (URL para copiar + campo Hottok + status).
- **Quem acessa:** Admin/Funcionário (desvincular = sensível → Admin).
- **Depende de:** INT-04, INT-05.
- **Critério de aceitação:** Dado a URL configurada na Hotmart e o Hottok salvo, Quando chega um webhook de venda, Então é validado, roteado ao projeto certo e gravado (idempotente).
- **Prioridade/Fase:** P0 / Base

### INT-04 · Cofre de credenciais por projeto
- **O que faz:** guarda com segurança todos os segredos de cada cliente (tokens OAuth, Hottok, IDs de conta).
- **Como faz:** armazenamento **cifrado, por tenant** (sai do `.env` único da Vercel); acesso só pelo servidor.
- **Como aparece:** invisível; refletido como "conta conectada" nas telas de integração.
- **Quem acessa:** sistema (gestão = Admin).
- **Depende de:** PRJ-03.
- **Critério de aceitação:** Dado dois projetos com contas Meta distintas, Quando cada sync roda, Então usa a credencial do projeto correto, sem cruzamento.
- **Prioridade/Fase:** P0 / Base

### INT-05 · Roteamento & validação de webhook
- **O que faz:** descobre a que projeto pertence cada webhook e rejeita os inválidos.
- **Como faz:** identifica o projeto pela URL única (+ segredo embutido) e valida o token/Hottok; idempotência por id de transação.
- **Como aparece:** invisível.
- **Quem acessa:** sistema.
- **Depende de:** INT-03, INT-04.
- **Critério de aceitação:** Dado um webhook com token inválido, Quando chega, Então é rejeitado e logado; Dado um reenvio do mesmo evento, Quando chega de novo, Então não duplica.
- **Prioridade/Fase:** P0 / Base

### INT-06 · Normalização de pedidos/eventos
- **O que faz:** traduz os formatos de Hotmart/Eduzz/Kiwify para **um modelo interno único**.
- **Como faz:** um **adaptador por plataforma**; cobre no mínimo **aprovada · reembolso/chargeback · parcial · (assinatura) renovação/cancelamento**. Mantém as regras de líquido/coorte iguais para qualquer checkout.
- **Como aparece:** invisível; reflete na consistência dos números.
- **Quem acessa:** sistema.
- **Depende de:** INT-05.
- **Critério de aceitação:** Dado um reembolso em qualquer checkout, Quando processado, Então remove o líquido e reescreve a coorte exatamente como hoje na Hotmart.
- **Prioridade/Fase:** P0 / Base (Hotmart) · Núcleo (Eduzz/Kiwify)

### INT-07 · Importação manual via CSV
- **O que faz:** subir dados que não vieram pelo sistema.
- **Como faz:** assistente de mapeamento de colunas; alvos: **leads · vendas · assinaturas · respostas de pesquisa** (e gasto de anúncio histórico, a confirmar). Dedup: **venda = id de transação**; **lead/resposta = e-mail**. Histórico de importações.
- **Como aparece:** tela "Importar dados" (por projeto) + histórico.
- **Quem acessa:** Admin/Funcionário.
- **Depende de:** INT-06 (modelo único), RAS-03.
- **Critério de aceitação:** Dado um CSV de vendas, Quando importado, Então cada linha cai no modelo único, sem duplicar transações já recebidas por webhook.
- **Prioridade/Fase:** P1 / Núcleo

### INT-08 · Sync de métricas de anúncio
- **O que faz:** puxa gasto e métricas de Meta/Google/TikTok para a nossa base.
- **Como faz:** cron periódico por projeto/conta; grava na base (dashboard nunca lê do anúncio ao vivo). Métricas conforme V1/V2/V3 (impressões, cliques, CTR, CPM, link clicks, vídeo 3s/p75/p95/plays, status).
- **Como aparece:** selo "Atualizado há X" + botão Atualizar nas telas.
- **Quem acessa:** sistema (disparo manual por Admin/Funcionário).
- **Depende de:** INT-01 ou INT-02; INT-04.
- **Critério de aceitação:** Dado uma conta conectada, Quando o sync roda, Então os números na base batem com o Gerenciador no mesmo recorte/fuso.
- **Prioridade/Fase:** P0 (Meta) / Base · Núcleo (Google/TikTok)

---

## Domínio 4 — Rastreio, Leads & Jornada

### RAS-01 · Pixel (script de rastreio)
- **O que faz:** rastreia visitantes e eventos nas páginas do cliente (pageview, ida ao checkout, captura de lead) e injeta o identificador no checkout.
- **Como faz:** JS vanilla, **1 pixel por projeto**; `visitor_id` 1st-party ≤30 chars; respeita DNT/LGPD; aperfeiçoado para ler o opt-in (RAS-03).
- **Como aparece:** instalado nas páginas do cliente (head).
- **Quem acessa:** sistema (config = Admin/Funcionário).
- **Depende de:** PRJ-01.
- **Critério de aceitação:** Dado o pixel instalado, Quando um visitante navega e vai ao checkout, Então o `visitor_id` chega ao checkout e liga o clique à venda.
- **Prioridade/Fase:** P0 / Base

### RAS-02 · Tela de configuração do pixel
- **O que faz:** entrega o código do pixel e orienta a instalação; mostra status.
- **Como faz:** snippet por projeto + instruções + **status (recebendo/sem sinal)** + mapeamento dos campos do formulário de opt-in para captura de lead.
- **Como aparece:** tela "Pixel" dentro do projeto.
- **Quem acessa:** Admin/Funcionário.
- **Depende de:** RAS-01.
- **Critério de aceitação:** Dado a tela do pixel, Quando o código é instalado, Então o status passa a "recebendo eventos" e os campos do opt-in mapeados começam a gerar leads.
- **Prioridade/Fase:** P0 / Base

### RAS-03 · Entidade Lead
- **O que faz:** representa a pessoa nomeada que fez opt-in (antes da compra).
- **Como faz:** nome/e-mail/telefone + UTMs + `visitor_id`; origem do dado: **pixel lendo o opt-in existente**, **formulário próprio (ENG-02)** ou **CSV (INT-07)** — todas as vias.
- **Como aparece:** lista de leads (por projeto/funil) — detalhada no Domínio 6.
- **Quem acessa:** Admin/Funcionário (export = a definir como sensível ou não).
- **Depende de:** RAS-01.
- **Critério de aceitação:** Dado um opt-in preenchido, Quando capturado, Então vira um lead ligado ao `visitor_id` e às UTMs daquele visitante.
- **Prioridade/Fase:** P1 / Núcleo

### RAS-04 · Identidade & resolução cross-device
- **O que faz:** mantém uma identidade coerente da pessoa entre dispositivos e etapas.
- **Como faz:** **`visitor_id` é a espinha** (1st-party); **e-mail liga lead↔comprador**; **`contact_hash` resolve cross-device**.
- **Como aparece:** invisível; sustenta jornada (RAS-05) e atribuição (RAS-07).
- **Quem acessa:** sistema.
- **Depende de:** RAS-03.
- **Critério de aceitação:** Dado um lead que compra de outro dispositivo, Quando o e-mail coincide, Então as duas pontas se unem na mesma pessoa.
- **Prioridade/Fase:** P1 / Núcleo

### RAS-05 · Jornada do cliente (linha do tempo)
- **O que faz:** mostra a história completa de uma pessoa com o negócio.
- **Como faz:** linha do tempo por pessoa unindo **toque anônimo → opt-in (lead) → resposta de pesquisa → checkout → compra → movimentos do pipeline**. **Visão CRM (posterior):** todas as **URLs navegadas com data/hora** e toda interação registrada.
- **Como aparece:** painel "Jornada" no detalhe do lead/cliente (Domínio 6).
- **Quem acessa:** Admin/Funcionário (Cliente: a decidir).
- **Depende de:** RAS-04.
- **Critério de aceitação:** Dado uma pessoa com várias interações, Quando abro sua jornada, Então vejo a sequência cronológica dos eventos. *(Núcleo = eventos-chave; Posterior = todas as URLs/data-hora estilo CRM.)*
- **Prioridade/Fase:** P1 (básica) · P2 (CRM completo)

### RAS-06 · Retenção & poda por tenant
- **O que faz:** controla o volume de dados brutos por projeto.
- **Como faz:** poda agendada por projeto respeitando a retenção; **mantém a jornada consolidada de quem virou lead/comprador**; **descarta só o toque bruto de visitante anônimo que nunca converteu**. Mantém pedidos e agregados.
- **Como aparece:** config de retenção no projeto (PRJ-02).
- **Quem acessa:** sistema.
- **Depende de:** PRJ-02, RAS-05.
- **Critério de aceitação:** Dado retenção de N dias, Quando a poda roda, Então toques anônimos não-convertidos > N dias somem, mas a jornada de quem converteu permanece.
- **Prioridade/Fase:** P1 / Núcleo

### RAS-07 · Atribuição last-click 7d
- **O que faz:** define qual origem leva o crédito da venda.
- **Como faz:** last-click determinístico em janela de 7 dias (herdado da V1), agora **por projeto**; snapshot da origem; reembolso herda atribuição.
- **Como aparece:** alimenta os cortes por origem/campanha/criativo.
- **Quem acessa:** sistema.
- **Depende de:** RAS-04, INT-06.
- **Critério de aceitação:** Dado uma venda com `visitor_id` conhecido, Quando atribuída, Então o crédito vai para o último clique em 7 dias, de forma reproduzível.
- **Prioridade/Fase:** P0 / Base

---

## Transversais — Engines (consumidas por vários funis)

> Decisão travada: estas são **engines reutilizáveis**, não features soltas dentro de cada funil. Evitam reescrever a mesma lógica em 6 lugares.

### ENG-01 · Qualificação por Pesquisa
- **O que faz:** marca um lead como **qualificado** com base nas respostas dele a perguntas específicas.
- **Como faz:** o usuário escolhe **perguntas + respostas** que definem "qualificado"; o sistema cruza com as respostas do lead (casadas por e-mail ou `visitor_id`). Mesma engine para High Ticket e Lançamento.
- **Como aparece:** config de qualificação no funil; flag "qualificado" no lead e nas métricas.
- **Quem acessa:** Admin/Funcionário.
- **Depende de:** ENG-02 ou Google Forms/CSV; RAS-03.
- **Critério de aceitação:** Dado uma regra (pergunta X = resposta Y → qualificado), Quando o lead responde, Então é marcado conforme a regra e entra na taxa de qualificados.
- **Prioridade/Fase:** P1 / Núcleo

### ENG-02 · Pesquisa & Formulário próprio
- **O que faz:** cria e hospeda formulários de pesquisa da própria plataforma.
- **Como faz:** **montador de formulário** dentro da plataforma + **página hospedada** embutível por **iframe** (na página de obrigado, principalmente, ou no opt-in). **Atribuição automática pelo `visitor_id`** (não pergunta e-mail). Alternativa de entrada: **Google Forms vinculado** (casa por pergunta de e-mail) e **CSV** (mesma lógica).
- **Como aparece:** tela de criação de pesquisa + código/iframe para embutir.
- **Quem acessa:** Admin/Funcionário.
- **Depende de:** RAS-01 (pixel na página de obrigado para repassar o `visitor_id` ao iframe).
- **Critério de aceitação:** Dado o formulário próprio embutido na obrigado com o pixel ativo, Quando a pessoa responde, Então a resposta liga ao `visitor_id` correto sem pedir e-mail.
- **Prioridade/Fase:** P1 / Núcleo (Google Forms/CSV primeiro; formulário próprio em seguida)

### ENG-03 · Pipeline de estágios (CRM-semente)
- **O que faz:** acompanha o lead por estágios comerciais editáveis (base do futuro CRM).
- **Como faz:** estágios configuráveis; **entrada manual** (e CSV); **timestamp em cada movimento**; suporta contagem de **follow-ups** e **tempo até a conversão** com **marco inicial configurável** (captura do lead **ou** uma reunião específica) → marco final = fechamento.
- **Como aparece:** quadro/lista de pipeline no funil (High Ticket primeiro); detalhe por lead.
- **Quem acessa:** Admin/Funcionário.
- **Depende de:** RAS-03, RAS-04.
- **Critério de aceitação:** Dado um lead movido entre estágios, Quando registro os movimentos, Então o sistema guarda data/hora de cada um e calcula tempo até conversão a partir do marco escolhido.
- **Prioridade/Fase:** P1 / Núcleo

### ENG-04 · Funil de tráfego (métricas de anúncio)
- **O que faz:** mostra o funil do anúncio com custo por etapa.
- **Como faz:** impressões → cliques (CTR) → LPV (custo) → checkouts (custo) → venda (CPA), + métricas de vídeo (3s/p75/p95) — as definições de V1/V2/V3. Lê da base (INT-08).
- **Como aparece:** bloco de funil de anúncio dentro dos funis que o usam (ex.: Perpétuo).
- **Quem acessa:** todos (leitura).
- **Depende de:** INT-08, ENG-05.
- **Critério de aceitação:** Dado um funil com conta atribuída, Quando abro o funil de tráfego, Então vejo cada etapa com volume, custo e taxa de conversão entre etapas.
- **Prioridade/Fase:** P0 / Base

### ENG-05 · Filtros de fonte por funil
- **O que faz:** o funil é uma **lente** sobre as fontes do **projeto**: atribui um subconjunto + filtros.
- **Como faz:** **Projeto é dono das fontes** (contas de anúncio, produtos, fontes de lead); o **funil atribui** as que quiser (fontes compartilháveis entre funis). Filtros: **campanha** = todas **ou** só as que contêm uma palavra (campo livre); **produto** = todas as vendas **ou** **oferta específica**; **recorrência** = só a 1ª compra (vem no webhook) **ou** todas as recorrências.
- **Como aparece:** etapa de configuração de cada funil.
- **Quem acessa:** Admin/Funcionário.
- **Depende de:** INT-03/04, PRJ-02.
- **Critério de aceitação:** Dado um funil com filtro "campanha contém 'PERP'", Quando os dados carregam, Então só entram campanhas com "PERP" no nome; Dado "oferta X", Então só vendas da oferta X.
- **Prioridade/Fase:** P0 / Base

---

## Domínio 5 — Funis

### FUN-00 · Modelo genérico de funil
- **O que faz:** entidade base que todos os tipos herdam.
- **Como faz:** funil = **tipo + fontes atribuídas (ENG-05) + etapas/KPIs do tipo + apresentação própria**. Vários por projeto, inclusive repetidos do mesmo tipo (ex.: 5 lançamentos).
- **Como aparece:** CRUD de funis dentro do projeto; cada tipo abre um layout distinto.
- **Quem acessa:** Admin/Funcionário criam/editam (excluir = sensível); Cliente visualiza.
- **Depende de:** PRJ-01, ENG-05.
- **Critério de aceitação:** Dado um projeto, Quando crio 2 funis do mesmo tipo, Então cada um tem suas fontes/filtros e dashboards independentes.
- **Prioridade/Fase:** P0 / Base

### FUN-01 · Perpétuo clássico
- **O que faz:** funil evergreen de venda contínua.
- **Como faz:** etapas **pageview → checkout → compra**, com mapeamento de **order bump → upsell → downsell → outros produtos** (via papéis de produto, por webhook); **inclui o funil de tráfego (ENG-04)**; **recorrência configurável** (só 1ª compra **ou** todas).
- **Como aparece:** dashboard de perpétuo (cartões + funil + tráfego).
- **Quem acessa:** todos (leitura); config = Admin/Funcionário.
- **Depende de:** RAS-07, ENG-04, ENG-05, INT-06.
- **Critério de aceitação:** Dado vendas com papéis de produto, Quando abro o perpétuo, Então vejo principal/bump/upsell/downsell/outros e o funil de tráfego; Dado "só 1ª compra", Então recorrências não são contadas.
- **Prioridade/Fase:** P0 / Base (é o tipo da validação 1×1×1)

### FUN-02 · High Ticket
- **O que faz:** funil comercial de ticket alto, com pipeline de reuniões/fechamento.
- **Como faz:** **pipeline manual (ENG-03)** + **qualificação por pesquisa (ENG-01)**. KPIs: nº de leads · taxa de qualificados · taxa de abordados · agendadas/abordados · agendadas/qualificados · presença · reagendamento (e presença do reagendamento) · show-off · conversão na call · conversão geral (fechamentos ÷ reuniões) · tempo médio até conversão (marco configurável) · nº médio de follow-ups até conversão.
- **Como aparece:** dashboard de High Ticket + quadro de pipeline.
- **Quem acessa:** todos (leitura); pipeline editado por Admin/Funcionário.
- **Depende de:** ENG-01, ENG-03, RAS-03.
- **Critério de aceitação:** Dado leads movidos no pipeline, Quando abro o dashboard, Então todas as taxas acima são calculadas e o tempo médio usa o marco inicial escolhido.
- **Prioridade/Fase:** P1 / Núcleo

### FUN-03 · Gestão de assinaturas
- **O que faz:** acompanha receita recorrente.
- **Como faz:** etapas **base ativa → novas → renovações → falha de cobrança (dunning) → cancelamento/reembolso → reativação**; **todas as métricas já agora**, incluindo **MRR e churn**; dados por **webhook Hotmart + CSV**.
- **Como aparece:** dashboard de assinaturas.
- **Quem acessa:** todos (leitura).
- **Depende de:** INT-06, INT-07.
- **Critério de aceitação:** Dado eventos de assinatura, Quando abro o dashboard, Então vejo novas/renovações/cancelamentos, MRR e churn no período; importação CSV preenche o que faltar do webhook.
- **Prioridade/Fase:** P1 / Núcleo *(dunning/reativação dependem do checkout enviar o evento — pré-mapeado.)*

### FUN-04 · Lançamento
- **O que faz:** funil de evento com janela de captação, aulas e carrinho.
- **Como faz:** **captação (leads/"ingressos")** → **aquecimento (CPLs/aulas: engajamento por entrada manual)** → **carrinho (vendas na janela)** → **debriefing**; usa **qualificação por pesquisa (ENG-01)**.
- **Como aparece:** dashboard de lançamento (captação, aulas, carrinho, debriefing).
- **Quem acessa:** todos (leitura); engajamento de aula inserido por Admin/Funcionário.
- **Depende de:** ENG-01, RAS-03, ENG-04.
- **Critério de aceitação:** Dado um lançamento configurado, Quando abro o dashboard, Então vejo captação × meta, qualificados, vendas na janela e o debriefing; engajamento de aula reflete os dados inseridos.
- **Prioridade/Fase:** P1 / Núcleo

### FUN-05 · Negócios físicos
- **O que faz:** funil para negócios físicos que anunciam (venda offline).
- **Como faz:** **forma mais simples possível**: clique → lead (form/WhatsApp) → contato/qualificação → visita → **venda offline** (etapas manuais).
- **Como aparece:** dashboard simples do tipo.
- **Quem acessa:** todos (leitura); etapas manuais por Admin/Funcionário.
- **Depende de:** RAS-03, ENG-03.
- **Critério de aceitação:** Dado leads e vendas offline registrados, Quando abro o dashboard, Então vejo a contagem por etapa até a venda offline.
- **Prioridade/Fase:** P2 / Último

### FUN-06 · Venda de serviço
- **O que faz:** funil para prestação de serviço.
- **Como faz:** **forma mais simples possível**: clique → lead → diagnóstico/orçamento → proposta → fechamento → (contrato/recorrência, a confirmar). Etapas manuais.
- **Como aparece:** dashboard simples do tipo.
- **Quem acessa:** todos (leitura); etapas manuais por Admin/Funcionário.
- **Depende de:** RAS-03, ENG-03.
- **Critério de aceitação:** Dado propostas e fechamentos registrados, Quando abro o dashboard, Então vejo a conversão proposta → fechamento.
- **Prioridade/Fase:** P2 / Último

---

## Pendências para as próximas rodadas

**Domínios ainda não mapeados:**
- **6. Telas & Menus** — navegação global, hub/início, telas de origem das UTMs, saúde/alertas, listas de leads/vendas, e o "rosto" de cada dashboard.
- **7. Configurações** — consolidação do que é global × por projeto × por funil.
- **8. Métricas** — definições canônicas (fórmulas) de cada KPI novo, no padrão dos docs V1/V2.
- **9. Meu Negócio (custo/lucro)** — consolidação do projeto: junta todos os funis + gasto + faturamento + custos fixos (opcionais) → lucro líquido. **Prioridade mais baixa, por último.**

**Decisões em aberto a confirmar:**
- CSV também importa **gasto de anúncio histórico**? (INT-07)
- **Cliente** pode ver a **Jornada** (RAS-05) ou só os dashboards de funil?
- **Exportar CSV com dados de leads** é ação sensível (restrita) ou liberada ao Funcionário?
- **Venda de serviço**: ticket único, recorrente, ou ambos? (FUN-06)

**Dependência externa registrada:** OAuth "1 clique" (INT-01) exige aprovação de app em Meta/Google/TikTok — tratar como leva própria; validar antes com token manual (INT-02).
