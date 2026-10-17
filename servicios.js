/* Comportamiento común de las páginas de servicio de Anomalia.
   La barra se hace sólida al bajar. Sin dependencias. */
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

  /* El banner y el panel de cookies los gestiona analitica.js. */
})();
