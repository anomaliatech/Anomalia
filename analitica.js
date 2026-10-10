/* Medición de Anomalia: Consent Mode v2 + GTM / gtag / píxel de Meta.
   ------------------------------------------------------------------------------
   PARA ACTIVARLO solo hay que rellenar los identificadores de CFG. Con todos
   vacíos este fichero no carga nada ni hace ninguna petición a terceros.

   - Si se rellena `gtm`, Google Tag Manager lo gestiona todo: en GTM se crean las
     etiquetas (GA4, conversión de Google Ads, píxel) con activadores de "evento
     personalizado" sobre los nombres de la tabla de abajo.
   - Si NO hay GTM, se usan directamente `ga4`, `ads` (+ sus etiquetas de conversión)
     y `meta`, sin tocar nada más.

   Nada se carga hasta que el visitante pulsa "Aceptar todas" en el banner de
   cookies (consentimiento guardado en localStorage, clave anomaliaCookieConsent).

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
  var cargado = false;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  if (typeof window.gtag !== 'function') window.gtag = gtag;

  // Consent Mode v2: todo denegado por defecto, antes de que exista ninguna etiqueta.
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: 'denied', wait_for_update: 500
  });

  function script(src) {
    var s = document.createElement('script'); s.async = true; s.src = src;
    document.head.appendChild(s);
  }

  function cargar() {
    if (cargado) return;
    cargado = true;
    gtag('consent', 'update', {
      ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted'
    });
    if (CFG.gtm) {
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      script('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(CFG.gtm));
    } else if (CFG.ga4 || CFG.ads) {
      script('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(CFG.ga4 || CFG.ads));
      gtag('js', new Date());
      if (CFG.ga4) gtag('config', CFG.ga4);
      if (CFG.ads) gtag('config', CFG.ads);
    }
    if (CFG.meta && !CFG.gtm) {
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

  function consentido() {
    try { return localStorage.getItem(KEY) === 'accepted'; } catch (e) { return false; }
  }

  // Evento -> dataLayer (para GTM) y, sin GTM, a gtag / píxel directamente.
  window.anomaliaEvento = function (nombre, datos) {
    var e = { event: nombre };
    for (var k in (datos || {})) e[k] = datos[k];
    window.dataLayer.push(e);
    if (!cargado || CFG.gtm) return;
    var hayGoogle = CFG.ga4 || CFG.ads;
    if (nombre === 'cita_creada') {
      if (hayGoogle) gtag('event', 'generate_lead', { method: 'chat_ia_cita' });
      if (CFG.ads && CFG.adsCita) gtag('event', 'conversion', { send_to: CFG.ads + '/' + CFG.adsCita });
      if (window.fbq) window.fbq('track', 'Schedule');
    } else if (nombre === 'llamada_solicitada') {
      if (hayGoogle) gtag('event', 'generate_lead', { method: 'chat_ia_llamada' });
      if (CFG.ads && CFG.adsLlamada) gtag('event', 'conversion', { send_to: CFG.ads + '/' + CFG.adsLlamada });
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

  // Enganche con el banner de cookies que ya existe (ids ckAccept / ckReject).
  document.addEventListener('click', function (ev) {
    if (ev.target.closest && ev.target.closest('#ckAccept')) setTimeout(cargar, 0);
  });
  if (consentido()) cargar();
})();
