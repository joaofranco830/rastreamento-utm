/*!
 * t.js — Script de rastreio Franco Advertising (Fase 1)
 * JavaScript vanilla, sem dependências. Cole em TODAS as páginas do funil.
 *
 * O que faz:
 *  - Gera um visitor_id curto (24 hex minúsculos), guarda em cookie + localStorage.
 *  - Captura UTM / fbclid / referrer em cada página e envia eventos a /api/collect.
 *  - Injeta src=<visitor_id> nos links de checkout da Hotmart (atribuição).
 *
 * Configuração por data-* no próprio <script> (ver snippet no fim / docs).
 */
(function () {
  "use strict";

  // Guarda de ambiente: só roda no navegador, uma vez por página.
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__faTrackLoaded) return;
  window.__faTrackLoaded = true;

  // -------------------- CONFIG (data-* do <script>) --------------------
  var self = document.currentScript;
  function attr(name, def) {
    var v = self && self.getAttribute(name);
    return v == null ? def : v;
  }
  function csv(name, def) {
    var v = attr(name, null);
    if (!v) return def;
    return v.split(",").map(function (s) { return s.trim().toLowerCase(); })
            .filter(Boolean);
  }
  // Endpoint padrão = MESMA origem de onde este t.js foi carregado (nosso domínio)
  // + /api/collect. Assim funciona mesmo sem data-endpoint e mesmo se o construtor
  // de páginas remover atributos. data-endpoint ainda pode sobrescrever.
  function deriveEndpoint() {
    try {
      if (self && self.src) return new URL(self.src, location.href).origin + "/api/collect";
    } catch {}
    return "/api/collect";
  }

  var CONFIG = {
    endpoint: attr("data-endpoint", deriveEndpoint()),
    hotmartHosts: csv("data-hotmart-hosts", ["hotmart.com"]),
    checkoutUrlPatterns: csv("data-checkout-url", ["pay.hotmart.com", "/checkout", "/comprar"]),
    checkoutSelector: attr("data-checkout-selector", "")
  };

  var COOKIE = "fa_vid", LS = "fa_vid", MAX_AGE = 31536000; // 1 ano
  var VID_RE = /^[a-z0-9_-]{1,30}$/;

  // -------------------- visitor_id --------------------
  function isValidVid(v) { return typeof v === "string" && VID_RE.test(v); }

  function newVisitorId() {
    var b = new Uint8Array(12); // 12 bytes -> 24 hex chars (96 bits)
    window.crypto.getRandomValues(b);
    var s = "";
    for (var i = 0; i < b.length; i++) {
      var h = b[i].toString(16);
      s += h.length === 1 ? "0" + h : h;
    }
    return s; // [0-9a-f]{24}: minúsculo, sem "_", cabe nos 30 chars da Hotmart
  }

  function readCookie(name) {
    var m = document.cookie.match("(?:^|; )" + name + "=([^;]*)");
    return m ? decodeURIComponent(m[1]) : null;
  }
  function writeCookie(name, val) {
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = name + "=" + encodeURIComponent(val) +
      "; Max-Age=" + MAX_AGE + "; Path=/; SameSite=Lax" + secure;
  }
  function readLS(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function writeLS(k, v) { try { localStorage.setItem(k, v); } catch {} }

  function getVisitorId() {
    var c = readCookie(COOKIE);
    var ls = readLS(LS);

    // Cookie válido -> fonte primária; reespelha no LS e renova o cookie.
    if (isValidVid(c)) { if (ls !== c) writeLS(LS, c); writeCookie(COOKIE, c); return c; }
    // Só o LS sobreviveu (cookie expirou/limpou) -> recupera p/ o cookie.
    if (isValidVid(ls)) { writeCookie(COOKIE, ls); return ls; }

    // Nada válido: cria novo. Blindado: se crypto faltar OU lançar (sandbox/http
    // puro), cai num id efêmero (degrada, NUNCA quebra a página nem aborta o boot).
    try {
      var v = newVisitorId();
      writeCookie(COOKIE, v);
      writeLS(LS, v);
      return v;
    } catch {
      return ("x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 30);
    }
  }

  var VID = getVisitorId();

  // -------------------- captura + envio --------------------
  function pick(params, key, max) {
    var v = params.get(key);
    return v ? v.slice(0, max || 255) : null;
  }
  function buildPayload(type) {
    var p = new URLSearchParams(location.search);
    return {
      visitor_id: VID,
      type: type,
      url: location.href.slice(0, 2048),
      page: location.pathname.slice(0, 1024),
      referrer: document.referrer || null,
      utm_source: pick(p, "utm_source"),
      utm_medium: pick(p, "utm_medium"),
      utm_campaign: pick(p, "utm_campaign"),
      utm_term: pick(p, "utm_term"),
      utm_content: pick(p, "utm_content"),
      fbclid: pick(p, "fbclid", 512)
    };
  }
  function send(payload) {
    var body = JSON.stringify(payload);
    // text/plain via Blob -> "simple request" -> sem preflight CORS.
    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
        if (navigator.sendBeacon(CONFIG.endpoint, blob)) return;
      } catch { /* cai no fetch */ }
    }
    try {
      fetch(CONFIG.endpoint, {
        method: "POST",
        body: body,
        keepalive: true,
        mode: "cors",
        cache: "no-store",
        headers: { "Content-Type": "text/plain;charset=UTF-8" }
      }).catch(function () {});
    } catch {}
  }
  function track(type) { if (isValidVid(VID)) send(buildPayload(type)); }

  // -------------------- injeção do src nos links Hotmart --------------------
  function buildHostRe(hosts) {
    var esc = hosts.map(function (h) { return h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
    // casa "hotmart.com" e qualquer "*.hotmart.com" (pay., go., www.go. etc.)
    return new RegExp("(^|\\.)(" + esc.join("|") + ")$", "i");
  }
  var HOST_RE = buildHostRe(CONFIG.hotmartHosts);

  function isHotmartUrl(raw) {
    try {
      var u = new URL(raw, location.href);
      return (u.protocol === "http:" || u.protocol === "https:") && HOST_RE.test(u.hostname);
    } catch { return false; }
  }
  function withSrc(raw) {
    try {
      var u = new URL(raw, location.href);
      if (!u.searchParams.get("src")) u.searchParams.set("src", VID); // não sobrescreve src existente
      return u.toString();
    } catch { return raw; }
  }
  function decorateAnchor(a) {
    if (!a || a.nodeType !== 1 || a.tagName !== "A") return;
    var href = a.getAttribute("href");
    if (!href || !isHotmartUrl(href)) return;
    var nv = withSrc(href);
    if (nv !== href) a.setAttribute("href", nv);
  }
  function decorateIframe(f) {
    // checkout Hotmart embarcado (iframe): injeta o src ANTES de carregar.
    if (!f || f.nodeType !== 1 || f.tagName !== "IFRAME") return;
    var s = f.getAttribute("src");
    if (!s || !isHotmartUrl(s)) return;
    var ns = withSrc(s);
    if (ns !== s) f.setAttribute("src", ns);
  }
  function decorateAll(root) {
    var scope = root || document;
    if (!scope.getElementsByTagName) return;
    var as = scope.getElementsByTagName("a");
    for (var i = 0; i < as.length; i++) decorateAnchor(as[i]);
    var fr = scope.getElementsByTagName("iframe");
    for (var k = 0; k < fr.length; k++) decorateIframe(fr[k]);
  }

  // -------------------- checkout_iniciado --------------------
  var sentCheckout = false;
  function fireCheckoutOnce() {
    if (sentCheckout) return;
    sentCheckout = true;
    track("checkout_iniciado");
  }
  function looksLikeCheckout() {
    var href = location.href.toLowerCase();
    for (var i = 0; i < CONFIG.checkoutUrlPatterns.length; i++) {
      if (href.indexOf(CONFIG.checkoutUrlPatterns[i]) !== -1) return true;
    }
    if (CONFIG.checkoutSelector) {
      try { if (document.querySelector(CONFIG.checkoutSelector)) return true; } catch {}
    }
    return false;
  }

  // -------------------- observadores / handlers --------------------
  function startObserver() {
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "attributes" && m.target) {
          if (m.target.tagName === "A") decorateAnchor(m.target);
          else if (m.target.tagName === "IFRAME") decorateIframe(m.target);
          continue;
        }
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (!n || n.nodeType !== 1) continue;
          if (n.tagName === "A") decorateAnchor(n);
          if (n.tagName === "IFRAME") decorateIframe(n);
          decorateAll(n); // <a> e <iframe> descendentes
        }
      }
    });
    mo.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["href", "src"]
    });
  }

  function addClickCapture() {
    // Rede de segurança: garante o src no último instante e dispara checkout.
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a) return;
      var href = a.getAttribute("href");
      if (href && isHotmartUrl(href)) {
        var nv = withSrc(href);
        if (nv !== href) a.setAttribute("href", nv);
        fireCheckoutOnce();
      }
    }, true); // capture: roda antes dos handlers da página
  }

  function patchOpen() {
    if (!window.open || window.__faOpenPatched) return;
    window.__faOpenPatched = true;
    var orig = window.open;
    window.open = function (url) {
      var args = Array.prototype.slice.call(arguments);
      try { if (url && isHotmartUrl(url)) args[0] = withSrc(url); } catch {}
      return orig.apply(window, args);
    };
  }

  // -------------------- boot --------------------
  function boot() {
    track("pageview");
    decorateAll(document);
    startObserver();
    addClickCapture();
    patchOpen();
    if (looksLikeCheckout()) fireCheckoutOnce();
  }
  function schedule(fn) {
    if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 2000 });
    else setTimeout(fn, 0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { schedule(boot); });
  } else {
    schedule(boot);
  }

  // bfcache: ao voltar/avançar, a página vem do cache e o script NÃO re-executa.
  // Re-dispara o pageview para não subcontar (não duplica: load normal já contou).
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) track("pageview");
  });

  // Hook público mínimo (para funis SPA ou disparo manual de checkout).
  window.faTrack = {
    vid: function () { return VID; },
    pageview: function () { track("pageview"); },
    checkout: fireCheckoutOnce
  };
})();
