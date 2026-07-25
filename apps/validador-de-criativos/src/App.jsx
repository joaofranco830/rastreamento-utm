import React, { useState, useCallback } from "react";
import Papa from "papaparse";
import {
  Upload, Sparkles, Sun, Moon, RotateCcw, Target, Trophy, Layers,
  AlertTriangle, ChevronDown, TrendingUp, TrendingDown, Rocket, Wrench,
  Power, Trash2, Hourglass, Ban, Crown, Lightbulb, MessageCircle, Table2,
  Play, ArrowDown, ArrowUp, RefreshCw, Eye, Clock, FlaskConical
} from "lucide-react";

/* =========================================================================
   HELPERS
   ========================================================================= */
const norm = (s) =>
  (s == null ? "" : s.toString())
    .replace(/[\uFEFF\u200B\u200E\u200F]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const toNum = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (s === "" || s === "-") return 0;
  s = s.replace(/[R$\s%]/g, "");
  const hasDot = s.includes("."), hasComma = s.includes(",");
  if (hasDot && hasComma) s = s.replace(/\./g, "").replace(",", ".");
  else if (hasComma) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
};

const pct = (x, d = 1) =>
  x == null || !isFinite(x) ? "—" : (x * 100).toFixed(d).replace(".", ",") + "%";
const brl = (x) =>
  x == null || !isFinite(x) ? "—" : "R$ " + x.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const roasf = (x) => (x == null || !isFinite(x) ? "—" : x.toFixed(2).replace(".", ","));
const intf = (x) => (x == null || !isFinite(x) ? "—" : Math.round(x).toLocaleString("pt-BR"));

const FIELD_MATCHERS = {
  name: [/^nome do anuncio/, /^nome do criativo/, /^ad name/],
  spend: [/^valor usado/, /^valor gasto/, /^amount spent/],
  impr: [/^impressoes/, /^impressions/],
  clicks: [/^cliques no link/, /^link clicks/],
  v3: [/no minimo 3 ?seg/, /3 ?segundos/, /3-second/, /3 second/],
  v75: [/75 ?%/],
  v95: [/95 ?%/],
  ic: [/^finalizac.*iniciad/, /^initiate checkout/, /^checkout iniciad/],
  buys: [/^compras/, /^purchases/],
  adlink: [/permalink/, /pre.?visualizacao/, /visualizacao do anuncio/, /previa do anuncio/, /link.*anuncio/, /url.*anuncio/, /ad preview/, /preview.*ad/],
  adid: [/^identificacao do anuncio/, /^id do anuncio/, /^ad id/, /^codigo do anuncio/],
  acct: [/^identificacao da conta/, /^id da conta/, /account id/, /^conta de anuncio/],
  camp: [/^identificacao da campanha/, /^id da campanha/, /campaign id/],
  adset: [/^identificacao do conjunto/, /^id do conjunto/, /ad ?set id/],
};

function resolveColumns(headers) {
  const out = {};
  const H = headers.map((h) => ({ raw: h, n: norm(h) }));
  for (const field in FIELD_MATCHERS) {
    let found = null;
    for (const { raw, n } of H) {
      if (FIELD_MATCHERS[field].some((p) => p.test(n))) { found = raw; break; }
    }
    out[field] = found;
  }
  return out;
}

const FIELD_LABELS = {
  name: "Nome do anúncio", spend: "Valor usado", impr: "Impressões",
  clicks: "Cliques no link", v3: "Reproduções de 3 segundos",
  v75: "Reproduções de 75%", v95: "Reproduções de 95%",
  ic: "Finalizações de compra iniciadas", buys: "Compras",
};

function classify(v, avg) {
  if (v == null || avg == null || !isFinite(v) || !isFinite(avg) || avg === 0) return "sem";
  const r = v / avg;
  if (r > 1.15) return "acima";
  if (r < 0.85) return "abaixo";
  return "media";
}

const ML = {
  hook: { l: "Gancho", d: 1 },
  ret: { l: "Retenção", d: 1 },
  ctrCta: { l: "Chamada", d: 1 },
  tcc: { l: "Conversão do clique", d: 2 },
  tci: { l: "Conversão da impressão", d: 2 },
  icc: { l: "Checkout por clique", d: 1 },
};

const TIPS = {
  hook: "Gancho: % das pessoas impactadas que assistem pelo menos 3 segundos. Mede a força da abertura do vídeo.",
  ret: "Retenção: de quem assistiu 3s, quantos chegam a 75% do vídeo. Mede se o meio do vídeo segura a atenção.",
  fim: "Reta final: de quem chegou a 75%, quantos assistem até 95%. O fechamento do vídeo.",
  ctrCta: "Chamada: cliques no link divididos por quem viu o final (95%). A força da CTA — pode passar de 100%, já que dá pra clicar sem terminar o vídeo.",
  icc: "Checkout por clique: % dos cliques que iniciam o checkout. Mostra quão pronto pra comprar o clique chega.",
  fc: "Fecha compra: % dos checkouts iniciados que viram venda.",
  tcc: "Conversão do clique: % dos cliques que viram venda — a métrica-mãe da camada de contexto.",
};

/* =========================================================================
   CONTENT — suggestion map & scaling routes
   ========================================================================= */
const SUGESTOES = {
  hook: {
    titulo: "Refazer a abertura — os 3 primeiros segundos",
    itens: [
      "Troque a primeira frase e a primeira cena: é ali que a pessoa decide se fica.",
      "Teste abrir direto na dor ou na promessa, sem preâmbulo.",
      "Mude o elemento visual de abertura (cenário, movimento, texto na tela).",
    ],
  },
  ret: {
    titulo: "Segurar quem ficou — o meio do vídeo",
    itens: [
      "Corte a enrolação do meio e vá mais rápido ao ponto.",
      "Acelere o ritmo: frases mais curtas, cortes mais frequentes.",
      "Antecipe a recompensa — entregue valor antes de pedir algo.",
    ],
  },
  ctrCta: {
    titulo: "Fortalecer a chamada final",
    itens: [
      "Reescreva a CTA com um comando claro e direto.",
      "Dê uma razão pra clicar agora: bônus, prazo ou próximo passo concreto.",
      "Conecte a chamada com a promessa que o vídeo fez no início.",
    ],
  },
  conversao: {
    titulo: "Consertar o contexto — atrair quem compra",
    itens: [
      "Ajuste a promessa do vídeo pra atrair quem compra, não só quem se interessa.",
      "Deixe claro no próprio vídeo o que é a oferta e pra quem ela é — isso qualifica o clique antes dele acontecer.",
      "Use a narrativa dos seus criativos que mais convertem como base do novo contexto.",
    ],
  },
  curioso: {
    titulo: "Qualificar o clique — esse contexto gera curioso",
    itens: [
      "Reposicione a promessa: atraia quem está pronto pra comprar, não só pra espiar.",
      "Sinalize no vídeo o que é a oferta e pra quem ela é — curioso filtrado antes do clique não enche checkout à toa.",
      "Estude o contexto do seu campeão de conversão e traga essa qualificação pra este criativo.",
    ],
  },
};

const ROTAS = [
  { nome: "Conservadora", txt: "Aumente o orçamento de 20 em 20%, conferindo a estabilidade do ROAS a cada subida." },
  { nome: "Intermediária", txt: "Suba entre 50% e 80% da verba por dia e acompanhe o resultado de perto." },
  { nome: "Agressiva", txt: "Suba o criativo numa campanha isolada de pré-escala, com orçamento de 2 a 5× o valor do ticket." },
];

function reqMultiple(v) { if (v >= 20) return 1.5; if (v >= 10) return 2; if (v >= 5) return 2.5; if (v >= 3) return 3; return Infinity; }
function zonaFor(r) {
  if (r == null || !isFinite(r)) return null;
  if (r >= 4.5) return { k: "agressiva", label: "Folga alta", tone: "good", txt: "escala agressiva de verdade" };
  if (r >= 3) return { k: "meta", label: "Meta atingida", tone: "good", txt: "sempre escalar, sem agressividade" };
  if (r >= 2) return { k: "ok", label: "OK", tone: "gold", txt: "escalar com menos pressão" };
  if (r >= 1.5) return { k: "alerta", label: "Alerta", tone: "rust", txt: "nunca escalar — atenção" };
  return { k: "vermelho", label: "Vermelho", tone: "bad", txt: "desativar — margem real ameaçada" };
}
const CAMPLBL = { hook: "gancho", ret: "retenção", ctrCta: "chamada", tcc: "conversão do clique" };
const FIXSVC = {
  hook: { titulo: "Trocar o gancho — os 3 primeiros segundos", itens: [
    "O problema mora nos 3 primeiros segundos; mexer no meio do vídeo não resolve.",
    "Transplante um gancho já validado da própria conta (veja a referência) pra carregar esta narrativa.",
    "Ganchos que puxam hook alto: abrir já performando, quebra sonora, demonstração imediata, prova visual." ] },
  cta: { titulo: "Reforçar a chamada para ação", itens: [
    "Nunca CTA seca (\"clica em saiba mais\"): toda CTA carrega promessa, benefício ou dor que resolve.",
    "Abra um looping e NÃO feche dentro do vídeo — a resposta fica do outro lado do clique.",
    "Muitas vezes o criativo está certo e só faltou a CTA forte: é o ajuste mais barato que existe." ] },
  corpo: { titulo: "Reformular o corpo, manter o gancho", itens: [
    "O gancho funciona; o problema é a embalagem da mensagem no meio do vídeo.",
    "Reescreva a narrativa pra gerar curiosidade e conduzir ao interesse — mais ritmo, menos enrolação.",
    "Mantenha o gancho validado e teste só a nova forma de comunicar." ] },
  narrativa: { titulo: "Trocar a narrativa, aproveitar a forma", itens: [
    "A forma (gancho, ritmo, formato) gera clique barato — reaproveite.",
    "Troque a narrativa por uma copy validada da conta (a de maior TCC serve de molde).",
    "Um ângulo por criativo: não empilhe promessas." ] },
};

const ACTIONS = {
  ESCALAR: { t: "Escalar", icon: Rocket, tone: "good", grupo: "Escalar", gdesc: "gabaritaram as duas camadas e o ROAS real permite subir" },
  CORRIGIR: { t: "Corrigir formato", icon: Wrench, tone: "gold", grupo: "Corrigir o formato · patinho feio", gdesc: "a narrativa vende, mas o criativo não gera clique barato — conserte a forma, mantenha a narrativa" },
  NARRATIVA: { t: "Trocar narrativa", icon: RefreshCw, tone: "gold", grupo: "Trocar a narrativa · recuperação", gdesc: "o formato gera clique barato, mas a narrativa não converte — aproveite a forma, troque a narrativa" },
  ATENCAO: { t: "Dar atenção", icon: Eye, tone: "blue", grupo: "Dar atenção", gdesc: "resultado ainda emprestado ou ROAS na zona de alerta — observar de perto, não escalar" },
  RODANDO: { t: "Deixar rodando", icon: Hourglass, tone: "blue", grupo: "Deixar rodando", gdesc: "clique barato, mas ainda sem amostra de vendas (mínimo 3) pra julgar a narrativa" },
  DESATIVAR: { t: "Desativar", icon: Power, tone: "bad", grupo: "Desativar", gdesc: "sem força nas duas camadas, ou ROAS real na zona vermelha" },
  QUARENTENA: { t: "Quarentena", icon: Clock, tone: "neutral", grupo: "Quarentena · 2 dias", gdesc: "venda isolada com clique caro: pode ser sorte, espere 2 dias antes de decidir" },
  SEMBASE: { t: "Sem base", icon: Ban, tone: "neutral", grupo: "Sem base pra avaliar", gdesc: "gastaram menos de R$ 15 — cedo demais até pra ler a Camada 1" },
};

/* =========================================================================
   DIAGNOSIS ENGINE — método SVC (2 camadas, matriz de destinos, zonas, ROAS 3)
   ========================================================================= */
function metaLine(c, dx) {
  const p = [];
  if (c.cpc != null && dx.cpcMax != null) p.push(`CPC ${brl(c.cpc)} ${c.cpc <= dx.cpcMax ? "dentro do" : "acima do"} máximo pra ROAS 3 (${brl(dx.cpcMax)})`);
  if (c.cpm != null && dx.cpmMax != null) p.push(`CPM ${brl(c.cpm)} ${c.cpm <= dx.cpmMax ? "dentro do" : "acima do"} máximo (${brl(dx.cpmMax)})`);
  if (dx.zona) p.push(`ROAS ${roasf(c.roas)} · zona ${dx.zona.label.toLowerCase()} · fator de folga ${dx.folga != null ? dx.folga.toFixed(2).replace(".", ",") : "—"}`);
  return p.length ? p.join(" · ") : null;
}

function diagnose(c, A, targets, ticket, rankings) {
  const cls = {
    hook: classify(c.hook, A.hook), ret: classify(c.ret, A.ret), ctrCta: classify(c.ctrCta, A.ctrCta),
    tcc: classify(c.tcc, A.tcc), tci: classify(c.tci, A.tci), icc: classify(c.icc, A.icc),
  };
  const dx = { action: "RODANDO", arquetipo: null, foco: "", cls, porque: "", fazer: null, rotas: null, ref: null, meta: null, proj: null, aviso: null, folga: null, zona: null, cpcMax: null, cpmMax: null };

  const hookOK = c.hook != null && A.hook != null && c.hook >= 0.85 * A.hook;
  const ctaOK = c.ctrCta != null && c.ctrCta >= 1.0;
  const retLow = c.ret != null && A.ret != null && c.ret < 0.85 * A.ret;
  const c1pass = hookOK && ctaOK;
  let gargalo = null, leitura1 = "";
  if (!hookOK) { gargalo = "hook"; leitura1 = "o gancho não para a rolagem — o problema está nos 3 primeiros segundos"; }
  else if (!ctaOK && !retLow) { gargalo = "cta"; leitura1 = "chama atenção e prende, mas não move: quem assiste não acha motivo pra clicar (CTA fraca)"; }
  else if (!ctaOK && retLow) { gargalo = "corpo"; leitura1 = "gancho bom, mensagem mal embalada: não gera curiosidade nem interesse suficientes"; }
  else { leitura1 = retLow ? "gancho e chamada no ponto — clicam antes dos 75%, retenção baixa aqui é normal" : "Camada 1 gabaritada: para, prende e move"; }

  const champ = (k) => { const l = rankings[k] || []; const p = l.find((x) => x.name !== c.name); return p ? { nome: p.name, metric: CAMPLBL[k], valor: k === "tcc" ? pct(p.v, 2) : pct(p.v, 1), url: p.url } : null; };

  dx.cpcMax = (c.tcc != null) ? (ticket * c.tcc) / 3 : null;
  dx.cpmMax = (c.ctr != null && c.tcc != null) ? (1000 * c.ctr * c.tcc * ticket) / 3 : null;
  dx.folga = (c.roas != null) ? c.roas / 3 : null;
  dx.zona = zonaFor(c.roas);

  if (c.spend < 15) {
    dx.action = "SEMBASE"; dx.foco = "aguardar";
    dx.porque = `Investiu ${brl(c.spend)} — abaixo de R$ 15. Ainda não dá pra ler nem a Camada 1. Deixe rodar.`;
    return dx;
  }

  if (c.buys === 1 && c.cpc != null && A.cpc != null && c.cpc >= 2 * A.cpc) {
    dx.action = "QUARENTENA"; dx.foco = "esperar 2 dias";
    dx.porque = `Uma venda só, e o clique saiu caro: CPC ${brl(c.cpc)} (${(c.cpc / A.cpc).toFixed(1).replace(".", ",")}× a média da conta). Pode ter sido sorte. Espere 2 dias antes de qualquer decisão — sem a segunda venda, trate como Camada 2 reprovada.`;
    dx.aviso = `Amostra: 1 venda — margem de erro enorme. Regra da quarentena: 2 dias de observação.`;
    dx.meta = metaLine(c, dx);
    return dx;
  }

  const vendas = c.buys;
  const mult = (A.tcc && c.tcc != null) ? c.tcc / A.tcc : null;
  const multTxt = mult != null ? `${mult.toFixed(2).replace(".", ",")}× a média` : "";
  const req = reqMultiple(vendas);

  if (vendas < 3) {
    if (!c1pass && c.spend >= 25) {
      dx.action = "DESATIVAR"; dx.arquetipo = "Descarte"; dx.foco = "corte precoce pela Camada 1";
      dx.porque = `Corte precoce pela Camada 1: ${leitura1}. Com ${brl(c.spend)} gastos o criativo já mostrou que não gera clique barato — e isso não muda com mais verba. Desative sem esperar a venda.`;
      dx.fazer = FIXSVC[gargalo]; dx.ref = gargalo === "hook" ? champ("hook") : null; dx.meta = metaLine(c, dx);
      return dx;
    }
    dx.action = "RODANDO"; dx.foco = "colher amostra";
    const projRoas = (A.tcc && c.cpc) ? (ticket * A.tcc) / c.cpc : null;
    const projCpa = (A.tcc && c.cpc) ? c.cpc / A.tcc : null;
    dx.proj = projRoas != null ? { roas: projRoas, cpa: projCpa } : null;
    dx.porque = c1pass
      ? `Camada 1 no ponto — gera clique barato. Mas são ${vendas} venda${vendas === 1 ? "" : "s"} (o mínimo pra ler a narrativa é 3). Deixe rodar até juntar amostra; o ROAS projetado abaixo decide se vale seguir investindo no teste.`
      : `Ainda cedo: ${brl(c.spend)} gastos e ${vendas} venda${vendas === 1 ? "" : "s"}. A Camada 1 não firmou e não há amostra. Deixe rodar mais um pouco — corte pela Camada 1 se ela não fechar até ~R$ 30.`;
    dx.aviso = `Amostra: ${vendas} venda${vendas === 1 ? "" : "s"} — abaixo do mínimo de 3 pra veredito de Camada 2.`;
    dx.meta = metaLine(c, dx);
    return dx;
  }

  let c2;
  if (mult == null) c2 = "sem_amostra";
  else if (mult >= 1.15 && mult >= req) c2 = "validado";
  else if (mult >= 1.15) c2 = "sinal";
  else if (mult >= 0.85) c2 = "emprestado";
  else c2 = "fraco";

  const zVerm = dx.zona && dx.zona.k === "vermelho";
  const zAlerta = dx.zona && dx.zona.k === "alerta";

  if (c1pass && c2 === "validado") {
    dx.arquetipo = "Campeão";
    if (zVerm) {
      dx.action = "DESATIVAR"; dx.foco = "ROAS no vermelho";
      dx.porque = `As duas camadas gabaritaram (clique barato + TCC ${pct(c.tcc, 2)}, ${multTxt}), mas o ROAS real está em ${roasf(c.roas)} — zona vermelha. Somados os custos da operação, vira zero a zero. Desative pra não queimar margem e revise o CPM.`;
      dx.meta = metaLine(c, dx); return dx;
    }
    if (zAlerta) {
      dx.action = "ATENCAO"; dx.foco = "ROAS na zona de alerta";
      dx.porque = `Camadas gabaritadas, mas o ROAS real (${roasf(c.roas)}) está na zona de alerta (1,5–2) — fator de folga ${dx.folga.toFixed(2).replace(".", ",")}, fino demais. Aqui não se escala; dê atenção diária e só volte a subir se o ROAS firmar acima de 2.`;
      dx.meta = metaLine(c, dx); return dx;
    }
    dx.action = "ESCALAR"; dx.foco = "subir orçamento"; dx.rotas = ROTAS;
    const guia = mult >= 5 ? `TCC 5×+ a média — "põe pra torar": salto proporcional em campanha isolada de pré-escala.`
      : mult >= 3 ? `TCC 3× a média — escala bruta: pode subir com força (pré-escala isolada 2–5× o ticket ou +50–80%/dia).`
      : mult >= 2 ? `TCC 2× a média — suba 3–5× via campanha isolada de pré-escala, ou +50–80%/dia acompanhando.`
      : `TCC +50% — escolha a rota: de maciota (+20% a cada 20%) ou agressiva (+50–80%/dia, vigiando 3–4 dias).`;
    dx.porque = `Campeão: clique barato (Camada 1) + narrativa que converte em volume (TCC ${pct(c.tcc, 2)}, ${multTxt}, ${vendas} vendas). ROAS real ${roasf(c.roas)} — ${dx.zona.txt}. ${guia} Nunca suba mais de 20% de uma vez num criativo já rodando (reinicia a aprendizagem) — a exceção é a campanha nova de pré-escala.`;
    dx.meta = metaLine(c, dx); return dx;
  }

  if (!c1pass && (c2 === "validado" || c2 === "sinal")) {
    dx.action = "CORRIGIR"; dx.arquetipo = "Patinho feio"; dx.foco = `corrigir o ${gargalo === "hook" ? "gancho" : gargalo === "cta" ? "CTA" : "corpo"}`;
    dx.porque = `Patinho feio: a narrativa vende (TCC ${pct(c.tcc, 2)}, ${multTxt}${c2 === "sinal" ? ", ainda com amostra curta" : ""}) — isso é ouro e não se joga fora. Mas a Camada 1 trava: ${leitura1}. Corrija o formato mantendo a narrativa; não desative nem escale ainda.`;
    dx.fazer = FIXSVC[gargalo]; dx.ref = gargalo === "hook" ? champ("hook") : (gargalo === "cta" ? champ("ctrCta") : null); dx.meta = metaLine(c, dx);
    return dx;
  }

  if (c1pass && c2 === "fraco") {
    dx.action = "NARRATIVA"; dx.arquetipo = "Recuperação"; dx.foco = "trocar a narrativa";
    dx.porque = `Recuperação: o formato é bom — gera clique barato (Camada 1 gabaritada) — mas a narrativa não converte (TCC ${pct(c.tcc, 2)}, ${multTxt}, abaixo da conta). Aproveite a forma e troque a narrativa; use as copies validadas da conta como base.`;
    dx.fazer = FIXSVC.narrativa; dx.ref = champ("tcc"); dx.meta = metaLine(c, dx);
    return dx;
  }

  if (c1pass && c2 === "emprestado") {
    dx.action = "ATENCAO"; dx.foco = "resultado emprestado";
    dx.porque = `Resultado emprestado: a Camada 1 gabarita, mas o TCC está só na média da conta (${pct(c.tcc, 2)}, ${multTxt}) — o ROAS que aparece é do funil, não deste criativo. Não escala: subir verba aqui regride pra média. Máximo +10%/dia e observe; se o TCC subir acima da média com mais vendas, vira campeão.`;
    dx.meta = metaLine(c, dx);
    return dx;
  }

  dx.action = "DESATIVAR"; dx.arquetipo = "Descarte"; dx.foco = "liberar a verba";
  dx.porque = `Descarte: nenhuma camada firma — ${leitura1}; e a narrativa não converte acima da média (TCC ${pct(c.tcc, 2)}${mult != null ? `, ${multTxt}` : ""}). Desative e anote o aprendizado; concentre a verba no que já performa.`;
  dx.fazer = gargalo ? FIXSVC[gargalo] : null; dx.meta = metaLine(c, dx);
  return dx;
}

/* =========================================================================
   PROCESS
   ========================================================================= */
function process(rows, ticket) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const cols = resolveColumns(headers);
  const required = ["name", "spend", "impr", "clicks", "v3", "v75", "v95", "buys"];
  const missing = required.filter((f) => !cols[f]);
  if (missing.length) return { error: "missing", missing };

  const map = {};
  for (const r of rows) {
    const name = (r[cols.name] || "").toString().trim();
    if (!name) continue;
    if (!map[name]) map[name] = { name, spend: 0, impr: 0, v3: 0, v75: 0, v95: 0, clicks: 0, ic: 0, buys: 0, link: null, adid: null, acct: null, camp: null, adset: null };
    const m = map[name];
    m.spend += toNum(r[cols.spend]);
    m.impr += toNum(r[cols.impr]);
    m.v3 += toNum(r[cols.v3]);
    m.v75 += toNum(r[cols.v75]);
    m.v95 += toNum(r[cols.v95]);
    m.clicks += toNum(r[cols.clicks]);
    m.ic += cols.ic ? toNum(r[cols.ic]) : 0;
    m.buys += toNum(r[cols.buys]);
    if (!m.link && cols.adlink) {
      const lv = (r[cols.adlink] || "").toString().trim();
      if (/^https?:\/\//i.test(lv)) m.link = lv;
    }
    if (!m.adid && cols.adid) {
      const iv = (r[cols.adid] || "").toString().trim().replace(/\D/g, "");
      if (iv.length >= 8) {
        m.adid = iv;
        m.acct = cols.acct ? (r[cols.acct] || "").toString().replace(/\D/g, "") || null : null;
        m.camp = cols.camp ? (r[cols.camp] || "").toString().replace(/\D/g, "") || null : null;
        m.adset = cols.adset ? (r[cols.adset] || "").toString().replace(/\D/g, "") || null : null;
      }
    }
  }
  const creatives = Object.values(map);
  if (!creatives.length) return { error: "empty" };

  for (const c of creatives) {
    c.hook = c.impr > 0 ? c.v3 / c.impr : null;
    c.ret = c.v3 > 0 ? c.v75 / c.v3 : null;
    c.fim = c.v75 > 0 ? c.v95 / c.v75 : null;
    c.ctrCta = c.v95 > 0 ? c.clicks / c.v95 : null;
    c.ctr = c.impr > 0 ? c.clicks / c.impr : null;
    c.tcc = c.clicks > 0 ? c.buys / c.clicks : null;
    c.tci = c.impr > 0 ? c.buys / c.impr : null;
    c.icc = c.clicks > 0 ? c.ic / c.clicks : null;
    c.fc = c.ic > 0 ? c.buys / c.ic : null;
    c.cpc = c.clicks > 0 ? c.spend / c.clicks : null;
    c.cpm = c.impr > 0 ? (c.spend / c.impr) * 1000 : null;
    c.fat = c.buys * ticket;
    c.roas = c.spend > 0 ? c.fat / c.spend : null;
    c.previewUrl = c.link || null;
    if (c.adid && c.acct) {
      let u = `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${c.acct}`;
      if (c.camp) u += `&selected_campaign_ids=${c.camp}`;
      if (c.adset) u += `&selected_adset_ids=${c.adset}`;
      u += `&selected_ad_ids=${c.adid}`;
      c.mgrUrl = u;
    } else {
      c.mgrUrl = c.adid ? `https://adsmanager.facebook.com/adsmanager/manage/ads?selected_ad_ids=${c.adid}` : null;
    }
    c.adUrl = c.previewUrl || c.mgrUrl || null;
  }

  const T = creatives.reduce(
    (a, c) => ({
      spend: a.spend + c.spend, impr: a.impr + c.impr, v3: a.v3 + c.v3,
      v75: a.v75 + c.v75, v95: a.v95 + c.v95, clicks: a.clicks + c.clicks,
      ic: a.ic + c.ic, buys: a.buys + c.buys,
    }),
    { spend: 0, impr: 0, v3: 0, v75: 0, v95: 0, clicks: 0, ic: 0, buys: 0 }
  );

  const A = {
    hook: T.impr > 0 ? T.v3 / T.impr : null,
    ret: T.v3 > 0 ? T.v75 / T.v3 : null,
    fim: T.v75 > 0 ? T.v95 / T.v75 : null,
    ctrCta: T.v95 > 0 ? T.clicks / T.v95 : null,
    ctr: T.impr > 0 ? T.clicks / T.impr : null,
    tcc: T.clicks > 0 ? T.buys / T.clicks : null,
    tci: T.impr > 0 ? T.buys / T.impr : null,
    icc: T.clicks > 0 ? T.ic / T.clicks : null,
    fc: T.ic > 0 ? T.buys / T.ic : null,
    cpc: T.clicks > 0 ? T.spend / T.clicks : null,
    cpm: T.impr > 0 ? (T.spend / T.impr) * 1000 : null,
  };

  const targets = {
    cpcMax: A.tcc ? (ticket * A.tcc) / 3 : null,
    cpmMax: (A.ctr && A.tcc) ? (1000 * A.ctr * A.tcc * ticket) / 3 : null,
    tccAlvo: A.cpc ? (3 * A.cpc) / ticket : null,
    ticcAlvo: A.cpc && A.fc ? (3 * A.cpc) / ticket / A.fc : null,
    cc: A.fc,
  };

  /* alerta global de funil — só dispara com DOIS critérios juntos:
     (1) os criativos geram cliques de qualidade — a camada 1 da conta está no nível de mercado
         (pelo menos 2 das 3 métricas em ~85%+ do benchmark; uma acima já conta);
     (2) o funil como um todo converte abaixo do normal — a conversão do clique não chega ao
         alvo de ROAS 2 E há leak concreto no fundo do funil (ida ao checkout baixa e/ou
         conversão do checkout abaixo de 10%). */
  const mkt = { hook: 0.2, ret: 0.075, ctrCta: 1.0 };
  const realCount = creatives.filter((c) => c.spend >= 15).length;
  const l1AtMarket = [
    A.hook != null && A.hook >= 0.85 * mkt.hook,
    A.ret != null && A.ret >= 0.85 * mkt.ret,
    A.ctrCta != null && A.ctrCta >= 0.85 * mkt.ctrCta,
  ];
  const crit1 = l1AtMarket.filter(Boolean).length >= 2;
  const salesBelowTarget = A.tcc != null && targets.tccAlvo != null && A.tcc < targets.tccAlvo;
  // benchmarks de mercado do funil: conversão do checkout ~20%; ida ao checkout ~10%.
  // a ida ao checkout cai conforme o ticket sobe — acima de R$97 o piso fica proporcionalmente menor.
  const iccFloor = 0.10 * Math.min(1, 97 / ticket);
  const idaCheckoutLow = A.icc != null && A.icc < iccFloor;
  const checkoutConvLow = A.fc != null && A.fc < 0.85 * 0.20;
  const crit2 = T.ic > 0 && salesBelowTarget && (idaCheckoutLow || checkoutConvLow);
  const funnelAlert =
    realCount >= 2 && crit1 && crit2
      ? { icc: A.icc, fc: A.fc, checkoutConvLow, idaCheckoutLow }
      : null;

  const rank = (k) =>
    creatives.filter((c) => c[k] != null && c.spend >= 15)
      .sort((a, b) => b[k] - a[k]).slice(0, 3)
      .map((c) => ({ name: c.name, v: c[k], url: c.adUrl }));
  const rankings = { hook: rank("hook"), ret: rank("ret"), ctrCta: rank("ctrCta"), tcc: rank("tcc") };

  for (const c of creatives) c.dx = diagnose(c, A, targets, ticket, rankings, funnelAlert);

  creatives.sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1) || b.spend - a.spend);

  const geral = { fat: T.buys * ticket, roas: T.spend > 0 ? (T.buys * ticket) / T.spend : null };

  return { creatives, A, T, targets, rankings, ticket, geral, funnelAlert, market: { hook: 0.2, ret: 0.075, ctrCta: 1.0 } };
}

/* =========================================================================
   STYLES
   ========================================================================= */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700&family=Schibsted+Grotesk:ital,wght@0,400..900;1,400..900&display=swap');
.vc *{box-sizing:border-box;margin:0;padding:0;}
.vc{
  --serif:'Newsreader',Georgia,serif;--sans:'Schibsted Grotesk',system-ui,sans-serif;
  font-family:var(--sans);min-height:100vh;width:100%;color:var(--tx);background:var(--bg);
  -webkit-font-smoothing:antialiased;transition:background .25s,color .25s;
}
.vc.t-light{
  --bg:#F6F3EC;--panel:#FFFFFF;--panel2:#F0EBDF;--line:#E5DECE;--line2:#D8CFBA;
  --tx:#211D15;--mut:#6F6753;--mut2:#A29879;
  --gold:#92660F;--goldbg:#F3E7CB;--goldline:#E0CD9F;
  --good:#19744A;--goodbg:#DFEFE5;--goodline:#BBDCC8;
  --bad:#B23A31;--badbg:#F7E2DF;--badline:#E9C2BD;
  --rust:#AD5421;--rustbg:#F8E7DA;--rustline:#EACBB2;
  --blue:#2D5C9E;--bluebg:#E2EAF6;--blueline:#C2D2EA;
  --neutral:#7A7466;--neutralbg:#ECE8DD;--neutralline:#D9D2C0;
  --shadow:0 1px 2px rgba(60,50,20,.05),0 10px 30px -12px rgba(60,50,20,.12);
  --bgdec:radial-gradient(900px 420px at 85% -10%,rgba(146,102,15,.07),transparent 60%);
}
.vc.t-dark{
  --bg:#14110C;--panel:#1D1913;--panel2:#26211A;--line:#322B20;--line2:#443A2A;
  --tx:#EFE8D9;--mut:#A89C82;--mut2:#6E654F;
  --gold:#E3B45A;--goldbg:rgba(227,180,90,.13);--goldline:rgba(227,180,90,.34);
  --good:#4FC78D;--goodbg:rgba(79,199,141,.12);--goodline:rgba(79,199,141,.32);
  --bad:#F07B6F;--badbg:rgba(240,123,111,.12);--badline:rgba(240,123,111,.32);
  --rust:#EE9356;--rustbg:rgba(238,147,86,.12);--rustline:rgba(238,147,86,.32);
  --blue:#82ABE8;--bluebg:rgba(130,171,232,.12);--blueline:rgba(130,171,232,.32);
  --neutral:#9C9483;--neutralbg:rgba(156,148,131,.12);--neutralline:rgba(156,148,131,.3);
  --shadow:0 1px 2px rgba(0,0,0,.3),0 12px 32px -14px rgba(0,0,0,.5);
  --bgdec:radial-gradient(900px 420px at 85% -10%,rgba(227,180,90,.08),transparent 60%);
}
.vc{background-image:var(--bgdec);}
.vc .num{font-variant-numeric:tabular-nums;}
.vc-wrap{max-width:1140px;margin:0 auto;padding:26px 22px 90px;}

/* header */
.vc-top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding-bottom:20px;border-bottom:1px solid var(--line);}
.vc-brand{display:flex;align-items:center;gap:12px;min-width:0;}
.vc-mark{width:40px;height:40px;border-radius:12px;background:linear-gradient(150deg,#E9C46A,#9A6B15);display:grid;place-items:center;color:#241803;box-shadow:var(--shadow);flex:none;}
.vc-bt{font-family:var(--serif);font-weight:600;font-size:21px;letter-spacing:-.01em;line-height:1;}
.vc-bs{font-size:11px;color:var(--mut);letter-spacing:.07em;text-transform:uppercase;margin-top:4px;font-weight:600;}
.vc-actions{display:flex;align-items:center;gap:10px;}
.vc-btn{font-family:var(--sans);font-weight:700;border:0;cursor:pointer;border-radius:11px;padding:10px 18px;font-size:13.5px;display:inline-flex;align-items:center;gap:8px;transition:.15s;}
.vc-btn-g{background:linear-gradient(150deg,#E9C46A,#A9791C);color:#241803;box-shadow:var(--shadow);}
.vc-btn-g:hover{filter:brightness(1.05);transform:translateY(-1px);}
.vc-btn-o{background:var(--panel);color:var(--mut);border:1px solid var(--line2);}
.vc-btn-o:hover{color:var(--tx);}
.vc-tgl{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;background:var(--panel);border:1px solid var(--line2);color:var(--mut);cursor:pointer;transition:.15s;flex:none;}
.vc-tgl:hover{color:var(--tx);transform:translateY(-1px);}

/* watch link */
.vc-watch{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:7px;background:var(--goldbg);border:1px solid var(--goldline);color:var(--gold);flex:none;margin-left:7px;transition:.15s;cursor:pointer;vertical-align:middle;}
.vc-watch:hover{filter:brightness(1.06);transform:translateY(-1px);}

/* info tooltip trigger */
.vc-i{display:inline-grid;place-items:center;width:14px;height:14px;border-radius:99px;border:1px solid var(--line2);background:var(--panel);color:var(--mut2);font-size:9px;font-weight:800;cursor:help;margin-left:5px;font-family:var(--sans);line-height:1;flex:none;}
.vc-i:hover{color:var(--gold);border-color:var(--goldline);}
.vc-tipbar{margin-top:9px;background:var(--panel2);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:0 11px 11px 0;padding:10px 13px;font-size:12.5px;line-height:1.55;color:var(--mut);animation:vcUp .18s ease both;}

/* upload */
.vc-up{max-width:560px;margin:54px auto 0;animation:vcUp .5s ease both;}
.vc-h1{font-family:var(--serif);font-weight:500;font-size:42px;line-height:1.05;letter-spacing:-.02em;}
.vc-h1 em{font-style:italic;color:var(--gold);}
.vc-lead{color:var(--mut);font-size:15.5px;line-height:1.6;margin-top:14px;}
.vc-card{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:26px;margin-top:28px;box-shadow:var(--shadow);}
.vc-drop{border:1.5px dashed var(--line2);border-radius:15px;padding:32px 18px;text-align:center;cursor:pointer;transition:.16s;display:block;}
.vc-drop:hover{border-color:var(--gold);background:var(--goldbg);}
.vc-drop b{font-size:15px;display:block;margin-top:10px;font-weight:700;}
.vc-drop span{font-size:12.5px;color:var(--mut);display:block;margin-top:4px;}
.vc-file{margin-top:12px;font-size:13px;color:var(--good);display:flex;align-items:center;gap:7px;font-weight:600;}
.vc-lbl{display:block;font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin:22px 0 9px;}
.vc-inwrap{position:relative;display:flex;align-items:center;}
.vc-pre{position:absolute;left:14px;color:var(--mut);font-size:15px;font-weight:600;}
.vc-in{width:100%;background:var(--panel2);border:1px solid var(--line2);border-radius:12px;padding:13px 14px 13px 44px;color:var(--tx);font-size:16px;font-weight:600;outline:none;transition:.15s;font-family:var(--sans);}
.vc-in:focus{border-color:var(--gold);background:var(--panel);}
.vc-note{font-size:12px;color:var(--mut2);line-height:1.6;margin-top:16px;}
.vc-err{background:var(--badbg);border:1px solid var(--badline);border-radius:12px;padding:14px 16px;margin-top:18px;font-size:13.5px;color:var(--bad);line-height:1.5;}

/* hero */
.vc-hero{margin-top:30px;background:var(--panel);border:1px solid var(--line);border-radius:22px;padding:26px;box-shadow:var(--shadow);animation:vcUp .45s ease both;}
.vc-hk{font-family:var(--serif);font-style:italic;font-size:15px;color:var(--gold);}
.vc-ht{font-family:var(--serif);font-weight:500;font-size:30px;letter-spacing:-.015em;margin-top:4px;}
.vc-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:20px;}
@media(max-width:720px){.vc-stats{grid-template-columns:repeat(2,1fr);}}
.vc-stat{background:var(--panel2);border:1px solid var(--line);border-radius:15px;padding:15px 16px;min-width:0;}
.vc-stat .k{font-size:10.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;font-weight:700;}
.vc-stat .v{font-size:24px;font-weight:800;margin-top:6px;letter-spacing:-.01em;}
.vc-chips{display:flex;flex-wrap:wrap;gap:9px;margin-top:18px;}
.vc-chip{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;padding:8px 14px;border-radius:99px;border:1px solid;}
.vc-chip .ct{font-size:14px;font-weight:800;}

/* sections */
.vc-sec{margin-top:42px;animation:vcUp .5s ease both;}
.vc-sh{display:flex;align-items:center;gap:11px;margin-bottom:6px;}
.vc-sh .ic{width:32px;height:32px;border-radius:10px;background:var(--goldbg);border:1px solid var(--goldline);color:var(--gold);display:grid;place-items:center;flex:none;}
.vc-sh h2{font-family:var(--serif);font-weight:500;font-size:25px;letter-spacing:-.015em;}
.vc-sd{font-size:13.5px;color:var(--mut);margin:0 0 18px 43px;}

/* funnel alert */
.vc-alert{display:flex;gap:11px;align-items:flex-start;background:var(--rustbg);border:1px solid var(--rustline);border-radius:14px;padding:14px 16px;margin-bottom:18px;font-size:13.5px;line-height:1.6;color:var(--tx);}
.vc-alert b{color:var(--rust);}

/* action groups */
.vc-grp{margin-top:26px;}
.vc-gh{display:flex;align-items:center;gap:10px;margin-bottom:12px;min-width:0;}
.vc-gico{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;border:1px solid;flex:none;}
.vc-gt{font-size:16px;font-weight:800;letter-spacing:-.01em;}
.vc-gd{font-size:12.5px;color:var(--mut);}
.vc-gn{margin-left:auto;font-size:12px;font-weight:800;padding:3px 10px;border-radius:99px;border:1px solid var(--line2);color:var(--mut);flex:none;}

/* creative card */
.vc-cc{background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);margin-bottom:14px;overflow:hidden;max-width:100%;}
.vc-cch{display:flex;align-items:center;gap:13px;padding:16px 18px;cursor:pointer;flex-wrap:wrap;}
.vc-badge{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:7px 12px;border-radius:9px;border:1px solid;flex:none;}
.vc-ccn{flex:1;min-width:180px;}
.vc-ccn .nmrow{display:flex;align-items:center;min-width:0;}
.vc-ccn .nm{font-size:14.5px;font-weight:800;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
.vc-ccn .fc2{font-size:12px;color:var(--mut);margin-top:2px;}
.vc-mini{display:flex;gap:13px 16px;flex:none;flex-wrap:wrap;justify-content:flex-end;}
.vc-mini>div{text-align:right;}
.vc-mini .ml{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--mut);font-weight:800;}
.vc-mini b{font-size:15.5px;font-weight:800;}
.vc-chev{color:var(--mut2);transition:.2s;flex:none;}
.vc-chev.open{transform:rotate(180deg);}
.vc-ccb{padding:0 18px 20px;}

/* funnel */
.vc-fun{display:flex;align-items:stretch;background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:13px 10px;overflow-x:auto;max-width:100%;}
.vc-fn{min-width:76px;text-align:center;padding:6px 8px;flex:none;}
.vc-fn .n{font-size:14.5px;font-weight:800;}
.vc-fn .l{font-size:9.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;margin-top:3px;font-weight:700;}
.vc-ft{position:relative;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:3px;min-width:88px;padding:0 6px;flex:none;}
.vc-ft::before{content:'';position:absolute;left:2px;right:2px;top:34%;height:1.5px;background:var(--line2);}
.vc-pill{position:relative;z-index:1;font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:99px;border:1px solid;white-space:nowrap;background:var(--panel);}
.vc-ftn{position:relative;z-index:1;display:inline-flex;align-items:center;font-size:9px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;font-weight:700;}
.p-acima{color:var(--good);border-color:var(--goodline);background:var(--goodbg)!important;}
.p-abaixo{color:var(--bad);border-color:var(--badline);background:var(--badbg)!important;}
.p-media{color:var(--tx);border-color:var(--line2);}
.p-sem{color:var(--mut2);border-color:var(--line);}
.p-plain{color:var(--mut);border-color:var(--line);}
.vc-funext{display:flex;align-items:center;gap:9px;margin-top:10px;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:9px 13px;flex-wrap:wrap;}
.vc-funext .lb{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);display:inline-flex;align-items:center;}
.vc-openrow{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:2px;}
.vc-openlbl{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);}
.vc-openbtn{font-size:12px;font-weight:700;color:var(--gold);background:var(--goldbg);border:1px solid var(--goldline);border-radius:8px;padding:5px 11px;text-decoration:none;transition:.15s;}
.vc-openbtn:hover{filter:brightness(1.05);transform:translateY(-1px);}

/* diagnosis blocks */
.vc-blk{margin-top:16px;}
.vc-bt2{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin-bottom:7px;}
.vc-ptxt{font-size:14.5px;line-height:1.65;}
.vc-do{background:var(--panel2);border:1px solid var(--line);border-radius:13px;padding:14px 16px;}
.vc-do h4{font-size:13.5px;font-weight:800;margin-bottom:8px;}
.vc-do li{font-size:13.5px;line-height:1.6;color:var(--tx);margin-left:18px;margin-top:4px;}
.vc-refbox{display:flex;gap:11px;align-items:flex-start;background:var(--goldbg);border:1px solid var(--goldline);border-radius:13px;padding:13px 15px;}
.vc-refbox .rt{font-size:13.5px;line-height:1.55;min-width:0;}
.vc-refbox b{color:var(--gold);}
.vc-meta{background:var(--panel2);border-left:3px solid var(--gold);border-radius:0 12px 12px 0;padding:12px 15px;font-size:13.5px;line-height:1.6;}
.vc-rotas{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;}
@media(max-width:760px){.vc-rotas{grid-template-columns:1fr;}}
.vc-rota{background:var(--panel2);border:1px solid var(--line);border-radius:13px;padding:13px 14px;min-width:0;}
.vc-rota b{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--gold);display:block;margin-bottom:5px;}
.vc-rota p{font-size:13px;line-height:1.55;color:var(--tx);}
.vc-proj{display:flex;gap:22px;margin-top:14px;background:var(--bluebg);border:1px solid var(--blueline);border-radius:13px;padding:13px 16px;flex-wrap:wrap;}
.vc-proj .l{font-size:10px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;font-weight:800;}
.vc-proj .n2{font-size:21px;font-weight:800;margin-top:2px;}
.vc-aviso{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:var(--mut);margin-top:13px;line-height:1.5;}

/* reference sections */
.vc-2col{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
@media(max-width:760px){.vc-2col{grid-template-columns:1fr;}}
.vc-2col>.vc-panel{min-width:0;}
.vc-panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;box-shadow:var(--shadow);min-width:0;max-width:100%;}
.vc-panel h3{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;font-weight:800;margin-bottom:13px;}
.vc-trow{display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-top:1px solid var(--line);gap:10px;}
.vc-trow:first-of-type{border-top:0;}
.vc-trow .tl{font-size:13px;color:var(--tx);font-weight:600;min-width:0;}
.vc-trow .tl span{display:block;font-size:11px;color:var(--mut2);font-weight:500;}
.vc-trow .tv{font-size:15.5px;font-weight:800;white-space:nowrap;}
.vc-mkt{font-size:11px;font-weight:700;display:flex;align-items:center;gap:4px;justify-content:flex-end;margin-top:2px;}
.vc-rankgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;}
@media(max-width:900px){.vc-rankgrid{grid-template-columns:repeat(2,1fr);}}
@media(max-width:520px){.vc-rankgrid{grid-template-columns:1fr;}}
.vc-rankgrid>.vc-panel{min-width:0;}
.vc-rrk{display:flex;align-items:center;gap:9px;padding:7px 0;border-top:1px solid var(--line);min-width:0;}
.vc-rrk:first-of-type{border-top:0;}
.vc-pos{width:20px;height:20px;border-radius:6px;background:var(--neutralbg);color:var(--mut);font-size:11px;font-weight:800;display:grid;place-items:center;flex:none;}
.vc-rrk.top .vc-pos{background:linear-gradient(150deg,#E9C46A,#A9791C);color:#241803;}
.vc-rnm{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;}
.vc-rvl{font-size:13px;font-weight:800;color:var(--gold);flex:none;}

/* table */
.vc-tblbtn{width:100%;display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px 18px;cursor:pointer;color:var(--tx);font-family:var(--sans);font-size:14px;font-weight:700;box-shadow:var(--shadow);}
.vc-tblhint{font-size:12px;color:var(--mut);margin:10px 2px 0;}
.vc-tbl-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:15px;background:var(--panel);margin-top:10px;box-shadow:var(--shadow);max-width:100%;}
table.vc-tbl{border-collapse:collapse;width:100%;min-width:920px;}
.vc-tbl th{font-size:10px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;font-weight:800;text-align:right;padding:12px;border-bottom:1px solid var(--line2);white-space:nowrap;cursor:pointer;user-select:none;}
.vc-tbl th:hover{color:var(--tx);}
.vc-tbl th.on{color:var(--gold);}
.vc-tbl th:first-child,.vc-tbl td:first-child{text-align:left;position:sticky;left:0;background:var(--panel);}
.vc-tbl th:first-child{cursor:default;}
.vc-tbl td{font-size:12.5px;font-weight:600;text-align:right;padding:11px 12px;border-bottom:1px solid var(--line);white-space:nowrap;}
.vc-tbl tr:last-child td{border-bottom:0;}
.vc-tbl .nm{max-width:230px;overflow:hidden;text-overflow:ellipsis;font-weight:700;}
.cl-acima{color:var(--good);}
.cl-abaixo{color:var(--bad);}
.cl-media{color:var(--tx);}
.cl-sem{color:var(--mut2);}
.vc-arq{display:inline-block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--gold);background:var(--goldbg);border:1px solid var(--goldline);border-radius:6px;padding:2px 7px;margin-right:8px;}
.vc-tbl tfoot td{border-top:2px solid var(--line2);font-weight:800;color:var(--tx);background:var(--panel2);}
.vc-tbl tfoot td:first-child{background:var(--panel2);}
.vc-tbl tfoot .nm{color:var(--mut);text-transform:uppercase;letter-spacing:.05em;font-size:11px;}
@keyframes vcUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
`;

/* =========================================================================
   SMALL COMPONENTS
   ========================================================================= */
const toneVars = (tone) => ({
  color: `var(--${tone})`,
  background: `var(--${tone}bg)`,
  borderColor: `var(--${tone}line)`,
});

function Watch({ url, size = 11 }) {
  if (!url) return null;
  return (
    <a className="vc-watch" href={url} target="_blank" rel="noreferrer"
       title="Assistir o criativo" onClick={(e) => e.stopPropagation()}>
      <Play size={size} />
    </a>
  );
}

function Funnel({ c, onTip }) {
  const stages = [
    { l: "Impressões", n: c.impr },
    { l: "Viu 3s", n: c.v3 },
    { l: "Chegou a 75%", n: c.v75 },
    { l: "Viu o final", n: c.v95 },
    { l: "Cliques", n: c.clicks },
    { l: "Checkouts", n: c.ic },
    { l: "Vendas", n: c.buys },
  ];
  const trans = [
    { k: "hook", name: "Gancho", v: c.hook, cls: c.dx.cls.hook, d: 1 },
    { k: "ret", name: "Retenção", v: c.ret, cls: c.dx.cls.ret, d: 1 },
    { k: "fim", name: "Reta final", v: c.fim, cls: "plain", d: 0 },
    { k: "ctrCta", name: "Chamada", v: c.ctrCta, cls: c.dx.cls.ctrCta, d: 0 },
    { k: "icc", name: "Checkout", v: c.icc, cls: c.dx.cls.icc, d: 1 },
    { k: "fc", name: "Fecha compra", v: c.fc, cls: "plain", d: 0 },
  ];
  return (
    <div className="vc-fun num">
      {stages.map((s, i) => (
        <React.Fragment key={i}>
          <div className="vc-fn">
            <div className="n">{intf(s.n)}</div>
            <div className="l">{s.l}</div>
          </div>
          {i < trans.length && (
            <div className="vc-ft">
              <span className={`vc-pill p-${trans[i].cls}`}>{pct(trans[i].v, trans[i].d)}</span>
              <span className="vc-ftn">
                {trans[i].name}
                <button className="vc-i" onMouseEnter={() => onTip(trans[i].k)} onMouseLeave={() => onTip(null)}
                        onClick={(e) => { e.stopPropagation(); onTip(trans[i].k, true); }}>i</button>
              </span>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function Block({ icon: Icon, label, children }) {
  return (
    <div className="vc-blk">
      <div className="vc-bt2"><Icon size={13} /> {label}</div>
      {children}
    </div>
  );
}

function CreativeCard({ c }) {
  const [open, setOpen] = useState(true);
  const [tip, setTipState] = useState(null);
  const [tipLock, setTipLock] = useState(false);
  const setTip = (k, lock = false) => {
    if (lock) { setTipLock(tip === k && tipLock ? false : true); setTipState(tip === k && tipLock ? null : k); return; }
    if (tipLock) return;
    setTipState(k);
  };
  const dx = c.dx;
  const act = ACTIONS[dx.action];
  const Icon = act.icon;
  return (
    <div className="vc-cc">
      <div className="vc-cch" onClick={() => setOpen((o) => !o)}>
        <span className="vc-badge" style={toneVars(act.tone)}><Icon size={13} /> {act.t}</span>
        <div className="vc-ccn">
          <div className="nmrow"><span className="nm">{c.name}</span><Watch url={c.adUrl} /></div>
          <div className="fc2">{dx.arquetipo ? <span className="vc-arq">{dx.arquetipo}</span> : null}foco: {dx.foco}</div>
        </div>
        <div className="vc-mini num">
          <div>
            <span className="ml">ROAS</span>
            <b style={{ color: c.roas != null && c.roas >= 3 ? "var(--good)" : undefined }}>
              {dx.action === "SEMBASE" ? "—" : roasf(c.roas)}
            </b>
          </div>
          <div><span className="ml">Investido</span><b>{brl(c.spend)}</b></div>
          <div><span className="ml">Faturou</span><b>{brl(c.fat)}</b></div>
          <div>
            <span className="ml">Lucro</span>
            <b style={{ color: dx.action === "SEMBASE" ? undefined : (c.fat - c.spend) >= 0 ? "var(--good)" : "var(--bad)" }}>
              {brl(c.fat - c.spend)}
            </b>
          </div>
        </div>
        <ChevronDown size={18} className={`vc-chev ${open ? "open" : ""}`} />
      </div>

      {open && (
        <div className="vc-ccb">
          {(c.previewUrl || c.mgrUrl) && (
            <div className="vc-openrow">
              <span className="vc-openlbl"><Play size={12} /> Assistir o criativo:</span>
              {c.previewUrl && <a className="vc-openbtn" href={c.previewUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Prévia do anúncio</a>}
              {c.mgrUrl && <a className="vc-openbtn" href={c.mgrUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Abrir no Gerenciador de Anúncios</a>}
            </div>
          )}
          {dx.action !== "SEMBASE" && (
            <>
              <Funnel c={c} onTip={setTip} />
              <div className="vc-funext num">
                <span className={`vc-pill p-${dx.cls.tcc}`}>{pct(c.tcc, 2)}</span>
                <span className="lb">
                  Conversão do clique · clique → venda
                  <button className="vc-i" onMouseEnter={() => setTip("tcc")} onMouseLeave={() => setTip(null)}
                          onClick={(e) => { e.stopPropagation(); setTip("tcc", true); }}>i</button>
                </span>
              </div>
              {tip && <div className="vc-tipbar">{TIPS[tip]}</div>}
            </>
          )}

          {dx.aviso && (
            <div className="vc-aviso"><AlertTriangle size={14} color="var(--gold)" style={{ flex: "none", marginTop: 1 }} /> {dx.aviso}</div>
          )}

          <Block icon={MessageCircle} label="Por quê">
            <p className="vc-ptxt">{dx.porque}</p>
          </Block>

          {dx.proj && (
            <div className="vc-proj num">
              <div><div className="l">ROAS previsto</div><div className="n2" style={{ color: dx.proj.roas >= 3 ? "var(--good)" : "var(--blue)" }}>{roasf(dx.proj.roas)}</div></div>
              <div><div className="l">CPA previsto</div><div className="n2">{brl(dx.proj.cpa)}</div></div>
              <div style={{ alignSelf: "center", fontSize: 12, color: "var(--mut)", maxWidth: 320, lineHeight: 1.5 }}>
                projeção: o custo de clique que ele já mostra + a conversão média da sua conta
              </div>
            </div>
          )}

          {dx.rotas && (
            <Block icon={Rocket} label="As três rotas de escala — escolha pela sua verba">
              <div className="vc-rotas">
                {dx.rotas.map((r, i) => (
                  <div className="vc-rota" key={i}><b>{r.nome}</b><p>{r.txt}</p></div>
                ))}
              </div>
            </Block>
          )}

          {dx.fazer && (
            <Block icon={Lightbulb} label="O que fazer na prática">
              <div className="vc-do">
                <h4>{dx.fazer.titulo}</h4>
                <ul>{dx.fazer.itens.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            </Block>
          )}

          {dx.ref && (
            <Block icon={Crown} label="Sua referência interna">
              <div className="vc-refbox">
                <Crown size={17} color="var(--gold)" style={{ flex: "none", marginTop: 2 }} />
                <div className="rt">
                  Use <b>{dx.ref.nome}</b><Watch url={dx.ref.url} /> como modelo: é o melhor <b>{dx.ref.metric.toLowerCase()}</b> da sua conta ({dx.ref.valor}). Estude o que ele faz nesse ponto e leve pro novo teste.
                </div>
              </div>
            </Block>
          )}

          {dx.meta && (
            <Block icon={Target} label="A meta">
              <div className="vc-meta num">{dx.meta}</div>
            </Block>
          )}
        </div>
      )}
    </div>
  );
}

function Cmp({ a, m }) {
  if (a == null || m == null) return null;
  const up = a >= m;
  return (
    <div className="vc-mkt" style={{ color: up ? "var(--good)" : "var(--bad)" }}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />} mercado {pct(m, m < 0.1 ? 1 : 0)}
    </div>
  );
}

/* =========================================================================
   APP
   ========================================================================= */
export default function App() {
  const [theme, setTheme] = useState("light");
  const [file, setFile] = useState(null);
  const [ticket, setTicket] = useState("");
  const [model, setModel] = useState(null);
  const [err, setErr] = useState(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [sortKey, setSortKey] = useState("roas");
  const [sortDir, setSortDir] = useState("desc");

  const onFile = useCallback((e) => {
    const f = e.target.files && e.target.files[0];
    if (f) { setFile(f); setErr(null); }
  }, []);

  const analyze = useCallback(() => {
    setErr(null);
    if (!file) { setErr({ msg: "Selecione o arquivo CSV exportado do Meta." }); return; }
    const t = toNum(ticket);
    if (!t || t <= 0) { setErr({ msg: "Informe o ticket do produto (comissão líquida por venda)." }); return; }
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const m = process(res.data || [], t);
        if (m.error === "missing") {
          setErr({
            msg: "Não encontrei colunas obrigatórias no CSV. Exporte do Meta no nível de Anúncio, incluindo as colunas de vídeo (3s, 75% e 95%).",
            missing: m.missing.map((f) => FIELD_LABELS[f]),
          });
          return;
        }
        if (m.error) { setErr({ msg: "Não consegui ler criativos nesse arquivo." }); return; }
        setModel(m); setTableOpen(false); setSortKey("roas"); setSortDir("desc");
      },
      error: () => setErr({ msg: "Falha ao ler o arquivo. Confira se é um CSV válido." }),
    });
  }, [file, ticket]);

  const reset = () => { setModel(null); setFile(null); setTicket(""); setErr(null); };

  const clickSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const Toggle = (
    <button className="vc-tgl" onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))} title="Alternar tema">
      {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
    </button>
  );

  /* ---------- UPLOAD ---------- */
  if (!model) {
    return (
      <div className={`vc t-${theme}`}>
        <style>{CSS}</style>
        <div className="vc-wrap">
          <div className="vc-top">
            <div className="vc-brand">
              <div className="vc-mark"><Sparkles size={21} /></div>
              <div>
                <div className="vc-bt">Validador de Criativos</div>
                <div className="vc-bs">métricas ocultas · diagnóstico automático</div>
              </div>
            </div>
            <div className="vc-actions">{Toggle}</div>
          </div>

          <div className="vc-up">
            <h1 className="vc-h1">Pare de rasgar dinheiro com <em>criativos ruins</em>.</h1>
            <p className="vc-lead">
              Suba o relatório do seu gerenciador e receba o veredito de cada criativo:
              o que escalar, o que corrigir, o que desligar — e exatamente como.
            </p>

            <div className="vc-card">
              <label className="vc-drop">
                <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
                <Upload size={26} color="var(--gold)" style={{ margin: "0 auto" }} />
                <b>Selecione o CSV do Meta</b>
                <span>relatório no nível de Anúncio</span>
              </label>
              {file && <div className="vc-file"><Sparkles size={13} /> {file.name}</div>}

              <label className="vc-lbl">Ticket do produto · comissão líquida por venda</label>
              <div className="vc-inwrap">
                <span className="vc-pre">R$</span>
                <input
                  className="vc-in num" inputMode="decimal" placeholder="97,00"
                  value={ticket} onChange={(e) => setTicket(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && analyze()}
                />
              </div>

              <div className="vc-note">
                Colunas necessárias: valor usado, impressões, cliques no link, reproduções de vídeo
                (3s / 75% / 95%), finalizações de compra iniciadas e compras.
                Criativos com o mesmo nome são somados automaticamente.
                Se o export tiver a coluna de link ou identificação do anúncio, o botão de assistir aparece ao lado de cada criativo.
              </div>

              {err && (
                <div className="vc-err">
                  <b>{err.msg}</b>
                  {err.missing && <div style={{ marginTop: 8 }}>Não encontradas: {err.missing.join(", ")}.</div>}
                </div>
              )}

              <button className="vc-btn vc-btn-g" style={{ marginTop: 20, width: "100%", justifyContent: "center" }} onClick={analyze}>
                <Sparkles size={16} /> Analisar criativos
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- DASHBOARD ---------- */
  const { creatives, A, T, targets, rankings, market, geral, funnelAlert } = model;
  const groups = ["ESCALAR", "CORRIGIR", "NARRATIVA", "ATENCAO", "RODANDO", "DESATIVAR", "QUARENTENA", "SEMBASE"]
    .map((k) => ({ k, list: creatives.filter((c) => c.dx.action === k) }))
    .filter((g) => g.list.length);

  const ranks = [
    { t: "Melhor gancho", d: 1, list: rankings.hook },
    { t: "Melhor retenção", d: 1, list: rankings.ret },
    { t: "Melhor chamada", d: 1, list: rankings.ctrCta },
    { t: "Melhor conversão", d: 2, list: rankings.tcc },
  ];

  const sorted = [...creatives].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const an = av == null || !isFinite(av) ? -Infinity : av;
    const bn = bv == null || !isFinite(bv) ? -Infinity : bv;
    return sortDir === "desc" ? bn - an : an - bn;
  });

  const TH = ({ k, children }) => (
    <th className={sortKey === k ? "on" : ""} onClick={() => clickSort(k)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        {children}
        {sortKey === k ? (sortDir === "desc" ? <ArrowDown size={10} /> : <ArrowUp size={10} />) : null}
      </span>
    </th>
  );

  return (
    <div className={`vc t-${theme}`}>
      <style>{CSS}</style>
      <div className="vc-wrap">
        <div className="vc-top">
          <div className="vc-brand">
            <div className="vc-mark"><Sparkles size={21} /></div>
            <div>
              <div className="vc-bt">Validador de Criativos</div>
              <div className="vc-bs">diagnóstico da análise</div>
            </div>
          </div>
          <div className="vc-actions">
            {Toggle}
            <button className="vc-btn vc-btn-o" onClick={reset}><RotateCcw size={14} /> Nova análise</button>
          </div>
        </div>

        {/* HERO */}
        <div className="vc-hero">
          <div className="vc-hk">o veredito da conta</div>
          <div className="vc-ht">
            {creatives.length} criativos analisados · ticket de {brl(model.ticket)}
          </div>
          <div className="vc-stats num">
            <div className="vc-stat"><div className="k">Investido</div><div className="v">{brl(T.spend)}</div></div>
            <div className="vc-stat"><div className="k">Vendas</div><div className="v">{intf(T.buys)}</div></div>
            <div className="vc-stat"><div className="k">Faturamento</div><div className="v">{brl(geral.fat)}</div></div>
            <div className="vc-stat">
              <div className="k">ROAS geral</div>
              <div className="v" style={{ color: geral.roas != null && geral.roas >= 3 ? "var(--good)" : geral.roas != null && geral.roas >= 2 ? "var(--gold)" : "var(--bad)" }}>{roasf(geral.roas)}</div>
            </div>
          </div>
          <div className="vc-chips">
            {groups.map((g) => {
              const act = ACTIONS[g.k]; const Icon = act.icon;
              return (
                <span key={g.k} className="vc-chip" style={toneVars(act.tone)}>
                  <Icon size={14} /> <span className="ct">{g.list.length}</span> {act.grupo.toLowerCase()}
                </span>
              );
            })}
          </div>
        </div>

        {/* DIAGNÓSTICOS POR AÇÃO */}
        <section className="vc-sec">
          <div className="vc-sh">
            <span className="ic"><Layers size={17} /></span>
            <h2>O que fazer com cada criativo</h2>
          </div>
          <p className="vc-sd">comando, motivo, correção, referência e meta — criativo por criativo</p>

          {funnelAlert && (
            <div className="vc-alert">
              <AlertTriangle size={17} color="var(--rust)" style={{ flex: "none", marginTop: 2 }} />
              <div>
                <b>O problema pode estar no funil, não nos criativos.</b> Seus criativos entregam cliques de qualidade — a camada 1 está no nível de mercado.{" "}
                {(() => {
                  const a = funnelAlert;
                  if (a.idaCheckoutLow && a.checkoutConvLow)
                    return `Mas o caminho da página até a compra trava em dois pontos: só ${pct(a.icc)} dos cliques iniciam o checkout e, desses, apenas ${pct(a.fc)} compram (mercado: 20%).`;
                  if (a.idaCheckoutLow)
                    return `Mas poucos chegam a iniciar o checkout (${pct(a.icc)}) — a página não está levando o clique até a compra.`;
                  return `A ida ao checkout até está saudável (${pct(a.icc)}), mas só ${pct(a.fc)} dos checkouts viram venda — abaixo da média de mercado de 20%. Isso costuma apontar pro checkout em si (travando, confuso ou mal carregado) ou pra uma página que atrai curioso e pesquisador de preço.`;
                })()}{" "}
                Vale investigar oferta, página e checkout por fora — os diagnósticos abaixo seguem focados no que cada criativo controla.
              </div>
            </div>
          )}

          {groups.map((g) => {
            const act = ACTIONS[g.k]; const Icon = act.icon;
            return (
              <div className="vc-grp" key={g.k}>
                <div className="vc-gh">
                  <span className="vc-gico" style={toneVars(act.tone)}><Icon size={15} /></span>
                  <div>
                    <div className="vc-gt">{act.grupo}</div>
                    <div className="vc-gd">{act.gdesc}</div>
                  </div>
                  <span className="vc-gn">{g.list.length}</span>
                </div>
                {g.list.map((c, i) => <CreativeCard key={i} c={c} />)}
              </div>
            );
          })}
        </section>

        {/* RÉGUA + METAS */}
        <section className="vc-sec">
          <div className="vc-sh">
            <span className="ic"><Target size={17} /></span>
            <h2>Sua régua e suas metas</h2>
          </div>
          <p className="vc-sd">as médias da conta (a régua dos diagnósticos) e o que mirar pra ROAS 2</p>
          <div className="vc-2col">
            <div className="vc-panel">
              <h3>Médias da conta · vs mercado</h3>
              <div className="num">
                <div className="vc-trow"><span className="tl">Gancho<span>quem para pra assistir</span></span><span style={{ textAlign: "right" }}><span className="tv">{pct(A.hook)}</span><Cmp a={A.hook} m={market.hook} /></span></div>
                <div className="vc-trow"><span className="tl">Retenção<span>segura até 75%</span></span><span style={{ textAlign: "right" }}><span className="tv">{pct(A.ret)}</span><Cmp a={A.ret} m={market.ret} /></span></div>
                <div className="vc-trow"><span className="tl">Chamada<span>viu o final e clicou</span></span><span style={{ textAlign: "right" }}><span className="tv">{pct(A.ctrCta)}</span><Cmp a={A.ctrCta} m={market.ctrCta} /></span></div>
                <div className="vc-trow"><span className="tl">Conversão do clique<span>clique → venda</span></span><span className="tv">{pct(A.tcc, 2)}</span></div>
                <div className="vc-trow"><span className="tl">CPC médio</span><span className="tv">{brl(A.cpc)}</span></div>
                <div className="vc-trow"><span className="tl">CPM médio</span><span className="tv">{brl(A.cpm)}</span></div>
              </div>
            </div>
            <div className="vc-panel">
              <h3>Metas pra ROAS 3</h3>
              <div className="num">
                <div className="vc-trow"><span className="tl">CPC máximo<span>custo máximo por clique (ROAS 3)</span></span><span className="tv" style={{ color: "var(--gold)" }}>{brl(targets.cpcMax)}</span></div>
                <div className="vc-trow"><span className="tl">CPM máximo<span>custo máximo por mil impressões (ROAS 3)</span></span><span className="tv" style={{ color: "var(--gold)" }}>{brl(targets.cpmMax)}</span></div>
                <div className="vc-trow"><span className="tl">Conversão do clique alvo<span>no CPC médio, pra ROAS 3</span></span><span className="tv">{pct(targets.tccAlvo, 2)}</span></div>
                <div className="vc-trow"><span className="tl">Pisos de mercado<span>gancho · retenção · chamada</span></span><span className="tv" style={{ fontSize: 12 }}>20% · 7% · 100%</span></div>
                <div className="vc-trow"><span className="tl">Conversão do checkout<span>referência de mercado</span></span><span className="tv">20%</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* CAMPEÕES */}
        <section className="vc-sec">
          <div className="vc-sh">
            <span className="ic"><Trophy size={17} /></span>
            <h2>Os campeões da conta</h2>
          </div>
          <p className="vc-sd">o que você já tem de bom — as referências internas dos diagnósticos</p>
          <div className="vc-rankgrid">
            {ranks.map((r, i) => (
              <div className="vc-panel" key={i}>
                <h3>{r.t}</h3>
                {r.list.length === 0 && <div style={{ fontSize: 12, color: "var(--mut2)" }}>sem dados</div>}
                {r.list.map((x, j) => (
                  <div className={`vc-rrk ${j === 0 ? "top" : ""}`} key={j}>
                    <span className="vc-pos">{j + 1}</span>
                    <span className="vc-rnm">{x.name}</span>
                    <Watch url={x.url} size={10} />
                    <span className="vc-rvl num">{pct(x.v, r.d)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* TABELA (APÊNDICE) */}
        <section className="vc-sec">
          <div className="vc-sh"><span className="ic"><FlaskConical size={17} /></span><h2>Inteligência para a próxima leva</h2></div>
          <p className="vc-sd">o que a Camada 2 revelou — dissecar os campeões e produzir guiado por dado</p>
          <div className="vc-panel" style={{ lineHeight: 1.7, fontSize: 14 }}>
            <p><b>Dissecar as narrativas campeãs.</b> Dê play nos criativos de maior TCC{rankings.tcc[0] ? <> (comece por <b>{rankings.tcc[0].name}</b>)</> : null} e extraia a dor, a promessa e as palavras que se repetem em 2+ criativos de TCC alto — esse é o material das copies validadas da conta.</p>
            <p style={{ marginTop: 10 }}><b>Ativos de Camada 1.</b> {rankings.hook[0] ? <>O melhor gancho da conta é o de <b>{rankings.hook[0].name}</b> ({pct(rankings.hook[0].v)}) — transplante esse gancho pra carregar novas narrativas.</> : "Assim que houver um gancho campeão, transplante-o pra novas narrativas."}</p>
            <p style={{ marginTop: 10 }}><b>Ordem de produção.</b> Monte a próxima leva na proporção <b>1/3 narrativas já validadas</b> (variações de formato dos campeões) + <b>2/3 ângulos novos</b> — um ângulo por criativo. Variação de formato de campeão testa só a Camada 1 (teste barato de R$ 15–30).</p>
          </div>
        </section>

        <section className="vc-sec">
          <button className="vc-tblbtn" onClick={() => setTableOpen((o) => !o)}>
            <Table2 size={17} color="var(--gold)" />
            Ver todos os números
            <span style={{ marginLeft: "auto" }}><ChevronDown size={17} className={`vc-chev ${tableOpen ? "open" : ""}`} /></span>
          </button>
          {tableOpen && (
            <>
              <div className="vc-tblhint">Clique no título de uma métrica pra ordenar do maior pro menor (clique de novo pra inverter).</div>
              <div className="vc-tbl-wrap num">
                <table className="vc-tbl">
                  <thead>
                    <tr>
                      <th>Criativo</th>
                      <TH k="spend">Gasto</TH>
                      <TH k="roas">ROAS</TH>
                      <TH k="hook">Gancho</TH>
                      <TH k="ret">Retenção</TH>
                      <TH k="ctrCta">Chamada</TH>
                      <TH k="ctr">CTR</TH>
                      <TH k="icc">Checkout/clq</TH>
                      <TH k="tcc">Conv. clique</TH>
                      <TH k="tci">Conv. impressão</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((c, i) => {
                      const cell = (v, avg, d = 1) => <td className={"cl-" + classify(v, avg)}>{pct(v, d)}</td>;
                      return (
                        <tr key={i}>
                          <td className="nm">
                            <span style={{ display: "inline-flex", alignItems: "center", maxWidth: "100%" }}>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                              <Watch url={c.adUrl} size={10} />
                            </span>
                          </td>
                          <td>{brl(c.spend)}</td>
                          <td style={{ color: c.roas != null && c.roas >= 3 ? "var(--good)" : c.roas != null && c.roas < 1 ? "var(--bad)" : undefined, fontWeight: 800 }}>{roasf(c.roas)}</td>
                          {cell(c.hook, A.hook)}
                          {cell(c.ret, A.ret)}
                          {cell(c.ctrCta, A.ctrCta)}
                          {cell(c.ctr, A.ctr, 2)}
                          {cell(c.icc, A.icc)}
                          {cell(c.tcc, A.tcc, 2)}
                          {cell(c.tci, A.tci, 2)}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="nm">Média geral</td>
                      <td>{brl(T.spend)}</td>
                      <td style={{ color: geral.roas != null && geral.roas >= 3 ? "var(--good)" : geral.roas != null && geral.roas < 1 ? "var(--bad)" : undefined }}>{roasf(geral.roas)}</td>
                      <td>{pct(A.hook)}</td>
                      <td>{pct(A.ret)}</td>
                      <td>{pct(A.ctrCta)}</td>
                      <td>{pct(A.ctr, 2)}</td>
                      <td>{pct(A.icc)}</td>
                      <td>{pct(A.tcc, 2)}</td>
                      <td>{pct(A.tci, 2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
