/* Medición y consentimiento de cookies de Anomalia: Consent Mode v2 + GTM / gtag / píxel de Meta.
   ------------------------------------------------------------------------------
   Este fichero es el ÚNICO dueño del consentimiento: muestra el banner (#cookie),
   abre el panel «Configurar cookies» (cualquier elemento con data-cookies-config)
   y carga las herramientas de medición solo para las categorías aceptadas.

   - Si se rellena `gtm`, Google Tag Manager lo gestiona todo: en GTM se crean las
     etiquetas (GA4, conversión de Google Ads, píxel) con activadores de "evento
     personalizado" sobre los nombres de la tabla de abajo.
   - Si NO hay GTM, se usan directamente `ga4`, `ads` (+ sus etiquetas de conversión)
     y `meta`, sin tocar nada más.
   - Categorías: «Analítica» aparece si hay ga4/gtm; «Publicidad» si hay ads/meta/gtm.
     Si se activa una categoría nueva, el banner se vuelve a mostrar a todo el mundo.
     OJO: al activar Ads o Meta hay que añadirlos al texto del banner y a la tabla
     de la política de cookies (index.html, <template id="legal-cookies">).

   El consentimiento se guarda 12 meses en localStorage (clave anomaliaCookieConsent):
   {"v":2,"fecha":<ms>,"cats":"analitica","analitica":true,"publicidad":false}.

   Eventos que emite la web (window.anomaliaEvento):
     chat_iniciado        primer mensaje en el chat
     cita_creada          cita agendada            -> conversión principal
     llamada_solicitada   "prefiero que me llaméis" -> conversión principal
     cita_al_calendario   pulsa "añadir a mi calendario"
     click_whatsapp       pulsa un enlace de WhatsApp
     click_telefono       pulsa un enlace tel:
     click_email          pulsa un enlace mailto:
*/
(function () {
  'use strict';
  var CFG = {
    gtm: '',         // GTM-XXXXXXX
    ga4: 'G-FH2Z2Z473W', // GA4, flujo web anomalia.business (2026-10-10)
    ads: '',         // AW-XXXXXXXXXX
    adsCita: '',     // etiqueta de la conversión "cita" (lo que va detrás de la barra en send_to)
    adsLlamada: '',  // etiqueta de la conversión "llámame"
    meta: ''         // ID numérico del píxel de Meta
  };
  var KEY = 'anomaliaCookieConsent';
  var VERSION = 2;
  var VIGENCIA_MS = 365 * 86400000; // la AEPD pide renovarlo como máximo a los 24 meses

  var CATEGORIAS = [
    { id: 'analitica', activa: !!(CFG.ga4 || CFG.gtm), titulo: 'Analítica',
      texto: 'Google Analytics: cuántas personas visitan la web, qué páginas ven, de dónde llegan y si reservan una cita. Nos sirve para mejorarla.' },
    { id: 'publicidad', activa: !!(CFG.ads || CFG.meta || CFG.gtm), titulo: 'Publicidad',
      texto: 'Medir si nuestros anuncios (Google Ads, Meta) traen clientes.' }
  ].filter(function (c) { return c.activa; });
  var CATS = CATEGORIAS.map(function (c) { return c.id; }).join(',');

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  if (typeof window.gtag !== 'function') window.gtag = gtag;

  // Consent Mode v2: todo denegado por defecto, antes de que exista ninguna etiqueta.
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: 'denied', wait_for_update: 500
  });

  // ------------------------------------------------------------ consentimiento
  function guardar(pref) {
    var c = { v: VERSION, fecha: Date.now(), cats: CATS, analitica: !!pref.analitica, publicidad: !!pref.publicidad };
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
    return c;
  }

  // Devuelve la elección vigente o null si hay que preguntar (nunca dada, caducada
  // o tomada cuando existían otras categorías).
  function leer() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return null; }
    if (!raw) return null;
    if (raw === 'accepted' || raw === 'rejected') { // formato anterior al 17-10-2026
      var si = raw === 'accepted';
      return guardar({ analitica: si, publicidad: si });
    }
    try {
      var c = JSON.parse(raw);
      if (!c || c.v !== VERSION || c.cats !== CATS || !(Date.now() - c.fecha < VIGENCIA_MS)) return null;
      return c;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------ carga de etiquetas
  var on = { an: false, pub: false };      // lo concedido en esta página
  var hecho = { gtm: false, gtag: false, ga4: false, ads: false, meta: false };

  function script(src) {
    var s = document.createElement('script'); s.async = true; s.src = src;
    document.head.appendChild(s);
  }

  // Borra las cookies de Google y Meta de este dominio (al retirar el consentimiento).
  function borrarCookies() {
    var host = location.hostname;
    var dominios = ['', host, '.' + host, '.' + host.split('.').slice(-2).join('.')];
    document.cookie.split(';').forEach(function (par) {
      var nombre = par.split('=')[0].trim();
      if (!/^(_ga|_gid|_gat|_gcl|_fbp|_fbc)/.test(nombre)) return;
      dominios.forEach(function (d) {
        document.cookie = nombre + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }

  function aplicar(c) {
    var an = !!c.analitica && CATS.indexOf('analitica') > -1;
    var pub = !!c.publicidad && CATS.indexOf('publicidad') > -1;
    // Retirar algo ya cargado: se borran sus cookies y se recarga para que no quede nada en memoria.
    if ((on.an && !an) || (on.pub && !pub)) {
      gtag('consent', 'update', {
        analytics_storage: an ? 'granted' : 'denied',
        ad_storage: pub ? 'granted' : 'denied', ad_user_data: pub ? 'granted' : 'denied', ad_personalization: pub ? 'granted' : 'denied'
      });
      borrarCookies();
      location.reload();
      return;
    }
    on.an = an; on.pub = pub;
    if (!an && !pub) return;
    gtag('consent', 'update', {
      analytics_storage: an ? 'granted' : 'denied',
      ad_storage: pub ? 'granted' : 'denied', ad_user_data: pub ? 'granted' : 'denied', ad_personalization: pub ? 'granted' : 'denied'
    });
    if (CFG.gtm) {
      if (!hecho.gtm) {
        hecho.gtm = true;
        window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
        script('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(CFG.gtm));
      }
      return;
    }
    var ga4 = an && CFG.ga4, ads = pub && CFG.ads;
    if ((ga4 || ads) && !hecho.gtag) {
      hecho.gtag = true;
      script('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga4 || ads));
      gtag('js', new Date());
    }
    if (ga4 && !hecho.ga4) { hecho.ga4 = true; gtag('config', CFG.ga4); }
    if (ads && !hecho.ads) { hecho.ads = true; gtag('config', CFG.ads); }
    if (pub && CFG.meta && !hecho.meta) {
      hecho.meta = true;
      /* snippet estándar del píxel de Meta */
      (function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = true; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', CFG.meta);
      window.fbq('track', 'PageView');
    }
  }

  // Evento -> dataLayer (para GTM) y, sin GTM, a gtag / píxel directamente.
  window.anomaliaEvento = function (nombre, datos) {
    var e = { event: nombre };
    for (var k in (datos || {})) e[k] = datos[k];
    window.dataLayer.push(e);
    if (CFG.gtm || !hecho.gtag && !hecho.meta) return;
    var hayGoogle = hecho.gtag;
    if (nombre === 'cita_creada') {
      if (hayGoogle) gtag('event', 'generate_lead', { method: 'chat_ia_cita' });
      if (hecho.ads && CFG.adsCita) gtag('event', 'conversion', { send_to: CFG.ads + '/' + CFG.adsCita });
      if (window.fbq) window.fbq('track', 'Schedule');
    } else if (nombre === 'llamada_solicitada') {
      if (hayGoogle) gtag('event', 'generate_lead', { method: 'chat_ia_llamada' });
      if (hecho.ads && CFG.adsLlamada) gtag('event', 'conversion', { send_to: CFG.ads + '/' + CFG.adsLlamada });
      if (window.fbq) window.fbq('track', 'Lead');
    } else {
      if (hayGoogle) gtag('event', nombre, datos || {});
      if (window.fbq && /^click_/.test(nombre)) window.fbq('track', 'Contact');
    }
  };

  // Clics de contacto fuera del chat (WhatsApp, teléfono, email).
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    var h = a.getAttribute('href');
    if (/^https:\/\/wa\.me\//.test(h)) window.anomaliaEvento('click_whatsapp', {});
    else if (/^tel:/.test(h)) window.anomaliaEvento('click_telefono', {});
    else if (/^mailto:/.test(h)) window.anomaliaEvento('click_email', {});
  });

  // ------------------------------------------------------------ banner y panel
  var ck = document.getElementById('cookie');
  var panel = null, volverA = null;

  function decidir(pref) {
    var c = guardar(pref);
    if (ck) ck.classList.remove('show');
    cerrarPanel();
    aplicar(c);
  }
  function todas(valor) {
    var p = {}; CATEGORIAS.forEach(function (c) { p[c.id] = valor; }); return p;
  }

  function crearPanel() {
    panel = document.createElement('div');
    panel.className = 'ckp';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'ckp-t');
    var filas = CATEGORIAS.map(function (c) {
      return '<label class="ckp-row"><span class="ckp-txt"><b>' + c.titulo + '</b><span>' + c.texto + '</span></span>' +
        '<input type="checkbox" role="switch" class="ckp-sw" data-cat="' + c.id + '"></label>';
    }).join('');
    panel.innerHTML =
      '<div class="ckp-scrim" data-ckp="cerrar"></div>' +
      '<div class="ckp-box">' +
        '<button type="button" class="ckp-x" data-ckp="cerrar" aria-label="Cerrar">&times;</button>' +
        '<h2 id="ckp-t">Configurar cookies</h2>' +
        '<p>Elige qué cookies aceptas. Puedes cambiarlo cuando quieras desde «Configurar cookies», en el pie de cada página. ' +
          '<a href="/#legal-cookies" data-ckp="cerrar">Política de cookies</a></p>' +
        '<div class="ckp-row"><span class="ckp-txt"><b>Necesarias</b><span>Recuerdan tu elección sobre las cookies. Sin ellas la web no puede respetarla.</span></span>' +
          '<span class="ckp-fija">Siempre activas</span></div>' +
        filas +
        '<div class="ckp-act">' +
          '<button type="button" class="btn-ghost" data-ckp="rechazar">Rechazar todas</button>' +
          '<button type="button" class="btn-ghost" data-ckp="guardar">Guardar selección</button>' +
          '<button type="button" class="btn-gold" data-ckp="aceptar">Aceptar todas</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(panel);
    panel.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-ckp]');
      if (!b) return;
      var acc = b.getAttribute('data-ckp');
      if (acc === 'cerrar') { cerrarPanel(); return; }
      if (acc === 'rechazar') decidir(todas(false));
      else if (acc === 'aceptar') decidir(todas(true));
      else {
        var p = {};
        panel.querySelectorAll('[data-cat]').forEach(function (i) { p[i.getAttribute('data-cat')] = i.checked; });
        decidir(p);
      }
    });
  }

  function abrirPanel() {
    if (!panel) crearPanel();
    var c = leer();
    panel.querySelectorAll('[data-cat]').forEach(function (i) { i.checked = !!(c && c[i.getAttribute('data-cat')]); });
    volverA = document.activeElement;
    panel.classList.add('show');
    var primero = panel.querySelector('[data-cat]') || panel.querySelector('[data-ckp="rechazar"]');
    if (primero) primero.focus();
  }
  function cerrarPanel() {
    if (!panel || !panel.classList.contains('show')) return;
    panel.classList.remove('show');
    if (volverA && volverA.focus) volverA.focus();
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest && ev.target;
    if (!t) return;
    if (t.closest('[data-cookies-config]')) { ev.preventDefault(); abrirPanel(); }
    else if (t.closest('#ckAccept')) decidir(todas(true));
    else if (t.closest('#ckReject, #ckNecesarias')) decidir(todas(false)); // «Rechazar» y «Solo necesarias» son lo mismo
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && panel && panel.classList.contains('show')) cerrarPanel();
  });

  var vigente = leer();
  if (vigente) aplicar(vigente);
  else if (ck && CATEGORIAS.length) setTimeout(function () { ck.classList.add('show'); }, 800);
})();
