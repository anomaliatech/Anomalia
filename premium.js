/* Detalles de interacción comunes a toda la web de Anomalia:
   - la luz de las tarjetas sigue al cursor (--cx / --cy),
   - el motivo del hero de las landings se desplaza con el cursor (--mx / --my),
   - las cifras de resultados cuentan hasta su valor al entrar en pantalla.
   Sin dependencias. Se apaga con "reducir movimiento" y en pantallas táctiles. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fino = matchMedia('(hover:hover) and (pointer:fine)').matches;

  /* ---- cifras que cuentan ---- */
  var fmt = new Intl.NumberFormat('es-ES');
  var cifras = document.querySelectorAll('[data-pm-count]');
  if (cifras.length && !reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        var el = e.target, fin = Number(el.getAttribute('data-pm-count')) || 0, t0 = null;
        var paso = function (ts) {
          if (!t0) t0 = ts;
          var p = Math.min((ts - t0) / 1600, 1);
          var v = fin * (1 - Math.pow(1 - p, 4));
          el.textContent = fmt.format(Math.round(v / 100) * 100);
          if (p < 1) requestAnimationFrame(paso); else el.textContent = fmt.format(fin);
        };
        requestAnimationFrame(paso);
        setTimeout(function () { el.textContent = fmt.format(fin); }, 2200);
      });
    }, { threshold: 0.5 });
    cifras.forEach(function (el) { io.observe(el); });
  }

  if (!fino || reduce) return;

  /* ---- luz de las tarjetas ---- */
  var SEL = '.card,.price-card,.z-svc,.cases-grid article,.pm-stat';
  document.addEventListener('pointermove', function (e) {
    var t = e.target.closest && e.target.closest(SEL);
    if (!t) return;
    var r = t.getBoundingClientRect();
    t.style.setProperty('--cx', (e.clientX - r.left).toFixed(0) + 'px');
    t.style.setProperty('--cy', (e.clientY - r.top).toFixed(0) + 'px');
  }, { passive: true });

  /* ---- hero de las landings: el motivo de fondo acompaña al cursor ---- */
  var hero = document.querySelector('.hero');
  if (hero && hero.querySelector('.hero-motif')) {
    var tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    var tick = function () {
      x += (tx - x) * .08; y += (ty - y) * .08;
      hero.style.setProperty('--mx', x.toFixed(4));
      hero.style.setProperty('--my', y.toFixed(4));
      raf = (Math.abs(tx - x) > .002 || Math.abs(ty - y) > .002) ? requestAnimationFrame(tick) : 0;
    };
    addEventListener('pointermove', function (e) {
      if (scrollY > innerHeight) return;
      tx = e.clientX / innerWidth * 2 - 1; ty = e.clientY / innerHeight * 2 - 1;
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
  }
})();
