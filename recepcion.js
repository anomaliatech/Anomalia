/* Recepcionista de voz de Anomalía.
   Un solo fichero, sin dependencias. Se engancha a cualquier elemento con
   [data-recepcion]: al pulsarlo abre una llamada de voz por WebRTC contra la
   OpenAI Realtime API (el token efímero y la config los da /api/voz-sesion).
   Las herramientas del agente (ver huecos / reservar) pasan por
   /api/voz-huecos y /api/voz-reservar, firmadas. */
(function () {
  "use strict";
  if (window.__recepcionAnomalia) return;
  window.__recepcionAnomalia = true;

  var EMAIL = "contacto@anomalia.business";
  var CALLS_URL = "https://api.openai.com/v1/realtime/calls";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ estilos */
  var CSS =
  ".rcp-root[hidden]{display:none!important}" +
  ".rcp-scrim{position:fixed;inset:0;background:rgba(6,6,6,.72);backdrop-filter:blur(4px);z-index:2147483040;opacity:0;transition:opacity .25s}" +
  ".rcp-card{position:fixed;z-index:2147483041;left:50%;top:50%;transform:translate(-50%,-46%);width:min(92vw,430px);" +
  "background:#151515;color:#FDFDFC;border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:1.5rem 1.4rem 1.2rem;" +
  "box-shadow:0 50px 130px -40px rgba(0,0,0,.8);font-family:'Manrope',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
  "opacity:0;transition:opacity .25s,transform .25s}" +
  ".rcp-open .rcp-scrim{opacity:1}.rcp-open .rcp-card{opacity:1;transform:translate(-50%,-50%)}" +
  ".rcp-top{display:flex;align-items:center;justify-content:space-between;gap:1rem;font-size:.9rem}" +
  ".rcp-id{display:flex;align-items:center;gap:.55em;font-weight:600;letter-spacing:.01em}" +
  ".rcp-dot{width:8px;height:8px;border-radius:50%;background:#58C583;box-shadow:0 0 0 4px rgba(88,197,131,.16)}" +
  ".rcp-time{font-variant-numeric:tabular-nums;color:#9B9B9B;font-size:.82rem}" +
  ".rcp-orb{margin:1.4rem auto 1rem;width:96px;height:96px;border-radius:50%;display:grid;place-items:center;" +
  "background:radial-gradient(circle at 50% 42%,rgba(198,161,91,.32),rgba(198,161,91,.05) 70%);transition:transform .12s linear}" +
  ".rcp-orb i{width:34px;height:34px;border-radius:50%;background:#C6A15B;box-shadow:0 0 26px rgba(198,161,91,.6)}" +
  ".rcp-orb.esc{background:radial-gradient(circle at 50% 42%,rgba(120,170,255,.34),rgba(120,170,255,.05) 70%)}" +
  ".rcp-orb.esc i{background:#8FB6FF;box-shadow:0 0 26px rgba(143,182,255,.6)}" +
  ".rcp-status{text-align:center;font-size:.98rem;color:#EDEDEC;margin:.2rem 0 .1rem;min-height:1.4em}" +
  ".rcp-log{max-height:34vh;overflow-y:auto;margin:.8rem 0 .2rem;display:flex;flex-direction:column;gap:.45rem;" +
  "scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.2) transparent}" +
  ".rcp-log:empty{display:none}" +
  ".rcp-msg{font-size:.9rem;line-height:1.45;padding:.5em .8em;border-radius:12px;max-width:86%;white-space:pre-wrap;word-wrap:break-word}" +
  ".rcp-msg.bot{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);align-self:flex-start}" +
  ".rcp-msg.user{background:rgba(198,161,91,.16);align-self:flex-end}" +
  ".rcp-acts{display:flex;gap:.6rem;margin-top:1rem}" +
  ".rcp-acts button{flex:1;border:0;cursor:pointer;font-family:inherit;font-weight:600;font-size:.92rem;padding:.7em 1em;border-radius:100px;transition:background .25s,border-color .25s}" +
  ".rcp-mute{background:transparent;border:1px solid rgba(255,255,255,.16)!important;color:#FDFDFC}" +
  ".rcp-mute:hover{border-color:#D8B978!important;color:#D8B978}" +
  ".rcp-mute.on{border-color:#D8B978!important;color:#D8B978}" +
  ".rcp-hang{background:#C6A15B;color:#141007}.rcp-hang:hover{background:#D8B978}" +
  ".rcp-retry{background:#C6A15B;color:#141007;flex:1}" +
  ".rcp-fine{text-align:center;font-size:.76rem;color:#8A8A8A;margin:.9rem 0 0}" +
  ".rcp-fine a{color:#B79355;text-decoration:underline}" +
  "@media (prefers-reduced-motion: reduce){.rcp-scrim,.rcp-card,.rcp-orb{transition:none}}";

  var st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  /* ------------------------------------------------------------------- estado */
  var pc = null, dc = null, micStream = null, remoteAudio = null, audioCtx = null, analyser = null, rafId = 0;
  var firma = null, firmaHuecos = null, hechas = {}, fallos = {};
  var activa = false, muteado = false;
  var tFin = 0, tickId = 0, inactId = 0, ocultaId = 0, focoPrevio = null;
  var maxMs = 5 * 60000, curBot = null, curUser = null, saludo = "";

  /* --------------------------------------------------------------------- DOM */
  var wrap, scrim, card, elId, elTime, elOrb, elStatus, elLog, elMute, elHang, elActs, elFine;

  function construir() {
    wrap = document.createElement("div");
    wrap.className = "rcp-root";
    wrap.innerHTML =
      '<div class="rcp-scrim" data-cerrar></div>' +
      '<div class="rcp-card" role="dialog" aria-modal="true" aria-label="Recepción de Anomalía">' +
        '<div class="rcp-top"><span class="rcp-id"><span class="rcp-dot"></span>Recepción de Anomalía</span>' +
        '<span class="rcp-time" hidden></span></div>' +
        '<div class="rcp-orb"><i></i></div>' +
        '<p class="rcp-status" aria-live="polite">Conectando…</p>' +
        '<div class="rcp-log" aria-live="polite"></div>' +
        '<div class="rcp-acts">' +
          '<button type="button" class="rcp-mute" hidden>Silenciar micro</button>' +
          '<button type="button" class="rcp-hang">Colgar</button>' +
        '</div>' +
        '<p class="rcp-fine">Al hablar aceptas nuestra <a href="/#legal-privacidad" target="_top">política de privacidad</a>.</p>' +
      '</div>';
    wrap.hidden = true;
    document.body.appendChild(wrap);
    scrim = wrap.querySelector(".rcp-scrim");
    card = wrap.querySelector(".rcp-card");
    elId = wrap.querySelector(".rcp-id");
    elTime = wrap.querySelector(".rcp-time");
    elOrb = wrap.querySelector(".rcp-orb");
    elStatus = wrap.querySelector(".rcp-status");
    elLog = wrap.querySelector(".rcp-log");
    elActs = wrap.querySelector(".rcp-acts");
    elMute = wrap.querySelector(".rcp-mute");
    elHang = wrap.querySelector(".rcp-hang");
    elFine = wrap.querySelector(".rcp-fine");

    elHang.addEventListener("click", function () { colgar(); });
    elMute.addEventListener("click", alternarMute);
    scrim.addEventListener("click", function () { colgar(); });
    document.addEventListener("keydown", alTeclado, true);
  }

  function abrir() {
    if (!wrap) construir();
    focoPrevio = document.activeElement;
    wrap.hidden = false;
    document.documentElement.classList.add("rcp-open");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(function () { elHang.focus(); });
  }
  function cerrar() {
    document.documentElement.classList.remove("rcp-open");
    document.body.style.overflow = "";
    if (wrap) wrap.hidden = true;
    if (focoPrevio && focoPrevio.focus) try { focoPrevio.focus(); } catch (e) {}
  }
  function alTeclado(e) {
    if (!wrap || wrap.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); colgar(); return; }
    if (e.key === "Tab") {
      var f = card.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
      f = Array.prototype.filter.call(f, function (el) { return !el.hidden && el.offsetParent !== null; });
      if (!f.length) return;
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }

  function estado(t) { if (elStatus) elStatus.textContent = t; }
  function orbEscucha(on) { if (elOrb) elOrb.classList.toggle("esc", !!on); }

  function linea(quien, texto) {
    var b = document.createElement("div");
    b.className = "rcp-msg " + quien;
    b.textContent = texto;
    elLog.appendChild(b);
    elLog.scrollTop = elLog.scrollHeight;
    return b;
  }
  function trozo(quien, delta) {
    if (!delta) return;
    var el = quien === "bot" ? curBot : curUser;
    if (!el) { el = linea(quien, ""); if (quien === "bot") curBot = el; else curUser = el; }
    el.textContent += delta;
    elLog.scrollTop = elLog.scrollHeight;
  }
  function cierraTrozo(quien, texto) {
    var el = quien === "bot" ? curBot : curUser;
    if (el && texto) el.textContent = texto;
    if (el && !el.textContent.trim()) el.remove();
    if (quien === "bot") curBot = null; else curUser = null;
  }

  /* ------------------------------------------------------------------- llamada */
  function bindear() {
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-recepcion]");
      if (!t) return;
      e.preventDefault();
      iniciar();
    });
  }

  async function iniciar() {
    if (activa) { abrir(); return; }
    if (!navigator.mediaDevices || !window.RTCPeerConnection) {
      abrir(); return fallo("Tu navegador no permite la llamada por voz. Escríbenos a " + EMAIL + " y te atendemos igual.");
    }
    activa = true;
    hechas = {};
    fallos = {};
    restaurarUI();
    abrir();
    estado("Pidiendo permiso del micrófono…");
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      return fallo("Necesito permiso para usar el micrófono. Actívalo y vuelve a intentarlo, o escríbenos a " + EMAIL + ".");
    }
    estado("Conectando con recepción…");
    try {
      var s = await fetch("/api/voz-sesion", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      var d = await s.json().catch(function () { return {}; });
      if (s.status === 429) return fallo(d.error || "Ahora mismo no podemos atenderte por voz. Escríbenos a " + EMAIL + ".");
      if (!s.ok || !d.client_secret || !d.client_secret.value) throw new Error(d.error || ("voz-sesion " + s.status));
      firma = d.firma;
      saludo = d.saludo || "";
      maxMs = (Number(d.maxMinutos) || 5) * 60000;

      pc = new RTCPeerConnection();
      pc.oniceconnectionstatechange = function () {
        if (pc && pc.iceConnectionState === "failed")
          fallo("Se ha cortado la llamada. Vuelve a intentarlo o escríbenos a " + EMAIL + ".");
      };
      pc.ontrack = function (e) {
        remoteAudio = remoteAudio || new Audio();
        remoteAudio.autoplay = true;
        remoteAudio.srcObject = e.streams[0];
        if (!reduce) visualizar(e.streams[0]);
      };
      micStream.getTracks().forEach(function (tk) { pc.addTrack(tk, micStream); });

      dc = pc.createDataChannel("oai-events");
      dc.onmessage = onEvento;
      dc.onopen = function () {
        arrancarTemporizadores();
        elMute.hidden = false;
        estado("Ya puedes hablar. Cuéntame qué necesitas.");
        // Que salude ella primero, como una recepcionista de verdad.
        enviar(saludo
          ? { type: "response.create", response: { instructions: 'Abre la llamada saludando exactamente así: "' + saludo + '"' } }
          : { type: "response.create" });
      };

      var offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      var sdp = await fetch(CALLS_URL + "?model=" + encodeURIComponent(d.model || ""), {
        method: "POST",
        headers: { authorization: "Bearer " + d.client_secret.value, "content-type": "application/sdp" },
        body: offer.sdp,
      });
      if (!sdp.ok) throw new Error("sdp " + sdp.status);
      await pc.setRemoteDescription({ type: "answer", sdp: await sdp.text() });
    } catch (e) {
      return fallo("No he podido conectar la llamada. Escríbenos a " + EMAIL + " y te atendemos.");
    }
  }

  function onEvento(ev) {
    var m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    switch (m.type) {
      case "response.output_audio_transcript.delta":
        trozo("bot", m.delta); break;
      case "response.output_audio_transcript.done":
        cierraTrozo("bot", m.transcript); estado("Ya puedes hablar."); break;
      case "conversation.item.input_audio_transcription.delta":
        trozo("user", m.delta); break;
      case "conversation.item.input_audio_transcription.completed":
        cierraTrozo("user", m.transcript); reiniciarInactividad(); break;
      case "input_audio_buffer.speech_started":
        orbEscucha(true); estado("Te escucho…"); reiniciarInactividad(); break;
      case "input_audio_buffer.speech_stopped":
        orbEscucha(false); estado("Un momento…"); break;
      case "response.function_call_arguments.done":
        herramienta(m.call_id, m.name, m.arguments); break;
      case "response.done":
        ((m.response && m.response.output) || []).forEach(function (it) {
          if (it.type === "function_call") herramienta(it.call_id, it.name, it.arguments);
        });
        break;
      case "error":
        console.warn("[recepcion] realtime:", m.error && m.error.message); break;
    }
  }

  function enviar(obj) { if (dc && dc.readyState === "open") dc.send(JSON.stringify(obj)); }

  async function herramienta(callId, nombre, argsStr) {
    if (!callId || hechas[callId]) return;
    hechas[callId] = true;
    var args = {};
    try { args = JSON.parse(argsStr || "{}"); } catch (e) {}
    var out;
    try {
      if (nombre === "ver_huecos") {
        var r = await fetch("/api/voz-huecos", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ firma: firma, servicio: args.servicio }),
        });
        var j = await r.json();
        if (!r.ok) throw new Error(j.error || "error");
        firmaHuecos = j.firmaHuecos;
        out = { huecos: j.huecos };
      } else if (nombre === "reservar_cita") {
        var r2 = await fetch("/api/voz-reservar", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            firma: firma, firmaHuecos: firmaHuecos,
            slotId: args.slotId, servicio: args.servicio, lead: args.lead,
          }),
        });
        var j2 = await r2.json();
        if (!r2.ok) throw new Error(j2.error || "error");
        out = { ok: true, cuando: j2.cuando };
      } else {
        out = { error: "herramienta desconocida" };
      }
      fallos[nombre] = 0;
    } catch (e) {
      // Si la misma herramienta falla una y otra vez, el modelo se queda en bucle
      // reintentando y el visitante solo oye silencio. Al tercer fallo le decimos
      // que pare y ofrezca el correo.
      fallos[nombre] = (fallos[nombre] || 0) + 1;
      var msg = String((e && e.message) || e);
      console.warn("[recepcion] herramienta", nombre, "fallo", fallos[nombre] + ":", msg);
      if (fallos[nombre] >= 3) {
        out = {
          error: msg,
          no_reintentar: true,
          instruccion: "Esta herramienta ha fallado varias veces. NO vuelvas a llamarla. Discúlpate en una frase y dile que escriba a " + EMAIL + " para cerrar la cita.",
        };
        estado("Algo va mal al reservar. Escríbenos a " + EMAIL + ".");
      } else {
        out = { error: msg };
      }
    }
    enviar({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(out) } });
    enviar({ type: "response.create" });
  }

  /* --------------------------------------------------------------- visual orb */
  function visualizar(stream) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      var datos = new Uint8Array(analyser.frequencyBinCount);
      var bucle = function () {
        if (!analyser) return;
        analyser.getByteFrequencyData(datos);
        var media = 0;
        for (var i = 0; i < datos.length; i++) media += datos[i];
        media /= datos.length;
        var e = 1 + Math.min(media / 90, 0.5);
        if (elOrb) elOrb.style.transform = "scale(" + e.toFixed(3) + ")";
        rafId = requestAnimationFrame(bucle);
      };
      bucle();
    } catch (e) {}
  }

  /* ---------------------------------------------------------- temporizadores */
  function arrancarTemporizadores() {
    tFin = Date.now() + maxMs;
    elTime.hidden = false;
    clearInterval(tickId);
    tickId = setInterval(function () {
      var queda = Math.max(0, tFin - Date.now());
      var mm = Math.floor(queda / 60000), ss = Math.floor((queda % 60000) / 1000);
      elTime.textContent = mm + ":" + (ss < 10 ? "0" : "") + ss;
      if (queda <= 30000 && queda > 29000) estado("Nos quedan 30 segundos de llamada.");
      if (queda <= 0) colgar("Se ha agotado el tiempo de esta llamada. Si necesitas más, escríbenos a " + EMAIL + " o vuelve a llamar.");
    }, 1000);
    reiniciarInactividad();
  }
  function reiniciarInactividad() {
    clearTimeout(inactId);
    inactId = setTimeout(function () {
      colgar("He colgado porque no te oía. Si sigues ahí, vuelve a llamar cuando quieras.");
    }, 45000);
  }

  function alternarMute() {
    if (!micStream) return;
    muteado = !muteado;
    micStream.getAudioTracks().forEach(function (t) { t.enabled = !muteado; });
    elMute.classList.toggle("on", muteado);
    elMute.textContent = muteado ? "Activar micro" : "Silenciar micro";
  }

  /* --------------------------------------------------------------- fin / error */
  function limpiar() {
    clearInterval(tickId); clearTimeout(inactId); clearTimeout(ocultaId);
    if (rafId) cancelAnimationFrame(rafId); rafId = 0; analyser = null;
    try { if (dc) dc.close(); } catch (e) {}
    try { if (pc) pc.close(); } catch (e) {}
    try { if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    if (remoteAudio) { try { remoteAudio.pause(); remoteAudio.srcObject = null; } catch (e) {} }
    if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; }
    pc = dc = micStream = null;
    curBot = curUser = null;
    activa = false; muteado = false;
  }

  function restaurarUI() {
    if (!wrap) return;
    elLog.innerHTML = "";
    elTime.hidden = true;
    elOrb.style.display = "";
    elOrb.classList.remove("esc");
    elOrb.style.transform = "";
    elMute.hidden = true;
    elMute.classList.remove("on");
    elMute.textContent = "Silenciar micro";
    elActs.innerHTML = "";
    elActs.appendChild(elMute);
    elActs.appendChild(elHang);
    elFine.hidden = false;
  }

  function terminarUI(msg, botonTexto) {
    estado(msg);
    elOrb.style.display = "none";
    elTime.hidden = true;
    elFine.hidden = true;
    elActs.innerHTML = "";
    var retry = document.createElement("button");
    retry.type = "button";
    retry.className = "rcp-retry";
    retry.textContent = botonTexto || "Llamar otra vez";
    retry.addEventListener("click", iniciar);
    var mail = document.createElement("button");
    mail.type = "button";
    mail.className = "rcp-mute";
    mail.textContent = "Escríbenos";
    mail.addEventListener("click", function () { location.href = "mailto:" + EMAIL; });
    elActs.appendChild(retry);
    elActs.appendChild(mail);
    requestAnimationFrame(function () { retry.focus(); });
  }

  // Con "motivo" (tiempo agotado, inactividad, salida) se explica por qué se cortó.
  // Sin él (el visitante pulsa Colgar / Esc) se cierra sin más.
  function colgar(motivo) {
    limpiar();
    if (!wrap || wrap.hidden) return;
    if (motivo) terminarUI(motivo);
    else cerrar();
  }
  function fallo(motivo) {
    limpiar();
    if (!wrap) construir();
    if (wrap.hidden) abrir();
    terminarUI(motivo, "Reintentar");
  }

  /* --------------------------------------------------- cierre al salir / ocultar */
  function cierreDuro() { if (pc) { try { pc.close(); } catch (e) {} } if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); }); }
  window.addEventListener("pagehide", cierreDuro);
  window.addEventListener("beforeunload", cierreDuro);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (!activa) return;
      ocultaId = setTimeout(function () {
        colgar("He colgado al salir de la página. Vuelve a llamar cuando quieras.");
      }, 25000);
    } else {
      clearTimeout(ocultaId);
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindear);
  else bindear();
})();
