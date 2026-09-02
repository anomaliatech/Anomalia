/* Comportamiento común de las páginas de servicio de Anomalia.
   La barra se hace sólida al bajar y el banner de cookies comparte
   el mismo consentimiento (localStorage) que la home. Sin dependencias. */
(function () {
  "use strict";

  /* --- barra: fondo sólido al hacer scroll --- */
  var bar = document.querySelector(".bar");
  if (bar) {
    var onScroll = function () {
      bar.classList.toggle("solid", window.scrollY > 30);
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* --- cookies: mismo consentimiento que index.html --- */
  var KEY = "anomaliaCookieConsent";
  var ck = document.getElementById("cookie");
  if (ck) {
    var stored = null;
    try { stored = localStorage.getItem(KEY); } catch (e) {}
    if (stored !== "accepted" && stored !== "rejected") {
      setTimeout(function () { ck.classList.add("show"); }, 800);
    }
    var set = function (v) {
      try { localStorage.setItem(KEY, v); } catch (e) {}
      ck.classList.remove("show");
    };
    var a = document.getElementById("ckAccept");
    var r = document.getElementById("ckReject");
    if (a) a.addEventListener("click", function () { set("accepted"); });
    if (r) r.addEventListener("click", function () { set("rejected"); });
  }
})();
