/* Chat de citas de Anomalia (componente compartido). Se monta solo en cada
   <div data-agchat>. Habla con /api/chat y agenda directamente en la agenda.
   Atributos opcionales: data-agchat-titulo, data-agchat-saludo,
   data-agchat-sugerencias="A|B|C" (chips), data-agchat-servicio (contexto). */
(function () {
  'use strict';
  var WA_NUM = '34601449173';
  var WA_TXT = 'Hola, vengo de anomalia.business y quiero información sobre ';

  var ICO_SEND = '<svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICO_WA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5 5 0 0 0 1.1 2.7 11.4 11.4 0 0 0 4.4 3.9c1.6.7 2.3.7 3.1.6a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3Z"/></svg>';

  function montar(host) {
    var titulo = host.getAttribute('data-agchat-titulo') || 'Reserva tu cita gratis en un minuto';
    var saludo = host.getAttribute('data-agchat-saludo') || 'Hola, soy el asistente de Anomalia. Cuéntame qué necesita tu negocio y te busco un hueco para hablarlo. Si lo prefieres, te llamamos nosotros.';
    var servicio = host.getAttribute('data-agchat-servicio') || '';
    var sugs = (host.getAttribute('data-agchat-sugerencias') || 'Quiero una página web|Quiero automatizar mi negocio|Quiero una auditoría').split('|');
    var waUrl = 'https://wa.me/' + WA_NUM + '?text=' + encodeURIComponent(WA_TXT + (servicio || 'vuestros servicios'));

    host.classList.add('agchat');
    host.setAttribute('aria-label', 'Asistente para reservar cita');
    host.innerHTML =
      '<div class="agchat-head"><span class="dot" aria-hidden="true"></span><div><strong></strong><span>Asistente de Anomalia · sin formularios</span></div></div>' +
      '<div class="agchat-log" aria-live="polite"></div>' +
      '<div class="agchat-sugs"></div>' +
      '<form class="agchat-bar" autocomplete="off"><input name="mensaje" maxlength="600" placeholder="Escribe aquí… p. ej. «quiero una web nueva»" aria-label="Escribe tu mensaje"><button type="submit" aria-label="Enviar mensaje">' + ICO_SEND + '</button></form>' +
      '<div class="agchat-foot"><span>Solo pedimos nombre y teléfono. Al usarlo aceptas la <a href="/#legal-privacidad">política de privacidad</a>.</span><a class="agchat-wa" href="' + waUrl + '" target="_blank" rel="noopener">' + ICO_WA + 'O por WhatsApp</a></div>';

    host.querySelector('.agchat-head strong').textContent = titulo;
    var log = host.querySelector('.agchat-log');
    var form = host.querySelector('form');
    var input = form.querySelector('input');
    var send = form.querySelector('button');
    var sugsBox = host.querySelector('.agchat-sugs');
    sugs.forEach(function (s) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = s.trim(); sugsBox.appendChild(b);
    });
    var llamar = document.createElement('button');
    llamar.type = 'button'; llamar.className = 'alt'; llamar.textContent = 'Prefiero que me llaméis';
    sugsBox.appendChild(llamar);

    var historial = [];
    var sesion = 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var ocupado = false;

    function burbuja(texto, quien) {
      var b = document.createElement('div');
      b.className = 'agmsg ' + quien;
      b.textContent = texto;
      log.appendChild(b);
      log.scrollTop = log.scrollHeight;
      return b;
    }
    burbuja(saludo, 'bot');

    function conversion(d) {
      /* cita o llamada solicitada en este turno: conversión para Google Ads / Meta (vía GTM, gtag o fbq) */
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: d.cita.tipo === 'llamada' ? 'llamada_solicitada' : 'cita_creada', cuando: d.cita.cuando || '', servicio: servicio });
      if (typeof window.gtag === 'function') window.gtag('event', 'generate_lead', { method: 'chat_ia' });
      if (typeof window.fbq === 'function') window.fbq('track', 'Schedule');
    }

    function enviar(msg) {
      if (!msg || ocupado) return;
      ocupado = true;
      sugsBox.style.display = 'none';
      burbuja(msg, 'user');
      input.value = '';
      input.disabled = true; send.disabled = true;
      var espera = document.createElement('div');
      espera.className = 'agmsg bot espera';
      espera.innerHTML = '<span></span><span></span><span></span>';
      log.appendChild(espera); log.scrollTop = log.scrollHeight;
      fetch('/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sesion, historial: historial, mensaje: msg })
      })
      .then(function (r) { return r.json().then(function (d) { d._status = r.status; return d; }); })
      .then(function (d) {
        espera.remove();
        if (d._status >= 400 && d.error) { burbuja(d.error, 'bot'); return; }
        burbuja(d.reply || 'Perdona, no te he entendido bien. ¿Me lo repites?', 'bot');
        if (Array.isArray(d.historial)) historial = d.historial;
        if (d.cita) conversion(d);
      })
      .catch(function () {
        espera.remove();
        burbuja('Ahora mismo no puedo conectar. Escríbenos por WhatsApp o a contacto@anomalia.business y te atendemos enseguida.', 'bot');
      })
      .finally(function () {
        ocupado = false; input.disabled = false; send.disabled = false;
        if (window.matchMedia('(min-width:900px)').matches) input.focus();
      });
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); enviar(input.value.trim()); });
    sugsBox.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var texto = b.textContent;
      if (b === llamar) texto = 'Prefiero que me llaméis' + (servicio ? ' para hablar de ' + servicio.toLowerCase() : '');
      else if (servicio && /^Quiero /.test(texto) === false) texto = texto;
      enviar(texto);
    });
  }

  function init() { document.querySelectorAll('[data-agchat]').forEach(montar); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
