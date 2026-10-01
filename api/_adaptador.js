// Adaptador fino Vercel/Netlify -> lib/rutas.js. La lógica NO vive aquí.
// Orden de las defensas (de más barata a más cara): método -> tamaño -> origen ->
// límite por IP -> validación -> y solo entonces se ejecuta la ruta.
const { cabecerasCors, origenAceptado, ipDe } = require('../lib/http');
const { ejecutar, ejecutarRecordatorios } = require('../lib/rutas');
const limite = require('../lib/limite');
const validar = require('../lib/validar');

const MAX_CUERPO = 64 * 1024;

function cuerpo(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body;
}

function ponCors(req, res) {
  const c = cabecerasCors(req.headers.origin);
  for (const [k, v] of Object.entries(c)) res.setHeader(k, v);
}

function manejarRuta(nombre) {
  return async (req, res) => {
    ponCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    const esGet = nombre === 'config' && req.method === 'GET';
    if (!esGet && req.method !== 'POST') {
      res.setHeader('allow', nombre === 'config' ? 'GET, POST, OPTIONS' : 'POST, OPTIONS');
      return res.status(405).json({ error: 'usa POST' });
    }
    if (Number(req.headers['content-length'] || 0) > MAX_CUERPO) {
      return res.status(413).json({ error: 'cuerpo demasiado grande' });
    }
    // Antes, un origen no permitido recibía "null" en CORS (el navegador no leía la
    // respuesta) pero la petición se ejecutaba igual y gastaba IA. Ahora se corta.
    if (!esGet && !origenAceptado(req.headers.origin)) {
      return res.status(403).json({ error: 'origen no permitido' });
    }

    const ip = ipDe(req);
    const l = await limite.comprobar(nombre, ip);
    if (l.restante != null) res.setHeader('x-ratelimit-remaining', String(l.restante));
    if (!l.ok) {
      res.setHeader('retry-after', String(l.reintentaSeg));
      res.setHeader('cache-control', 'no-store');
      return res.status(429).json({
        error: l.motivo === 'global'
          ? 'Hoy hemos tenido muchísimas visitas. Escríbenos a contacto@anomalia.business y te atendemos enseguida.'
          : 'Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo.',
      });
    }

    if (esGet) {
      // negocio.json no cambia entre despliegues: la CDN de Vercel lo sirve 1 h sin
      // tocar la función (s-maxage) y lo refresca en segundo plano (stale-while-revalidate).
      res.setHeader('cache-control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      try { return res.status(200).json(await ejecutar('config', {})); }
      catch (e) { res.setHeader('cache-control', 'no-store'); return res.status(500).json({ error: e.message }); }
    }

    res.setHeader('cache-control', 'no-store');
    try {
      const datos = validar[nombre] ? validar[nombre](cuerpo(req)) : cuerpo(req);
      const r = await ejecutar(nombre, datos);
      return res.status(200).json(r);
    } catch (e) {
      const code = e.code && e.code >= 400 && e.code < 600 ? e.code : 500;
      if (code === 500) console.error(`[api/${nombre}]`, e.message);
      return res.status(code).json({ error: code === 500 ? 'Error interno. Inténtalo de nuevo en un momento.' : e.message });
    }
  };
}

function manejarRecordatorios() {
  return async (req, res) => {
    ponCors(req, res);
    res.setHeader('cache-control', 'no-store');
    try {
      const esCronVercel = Boolean(req.headers['x-vercel-cron']);
      const token = (req.query && req.query.token) || null;
      return res.status(200).json(await ejecutarRecordatorios(token, esCronVercel));
    } catch (e) {
      return res.status(e.code || 500).json({ error: e.message });
    }
  };
}

module.exports = { manejarRuta, manejarRecordatorios };
