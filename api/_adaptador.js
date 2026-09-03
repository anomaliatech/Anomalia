// Adaptador fino Vercel/Netlify -> lib/rutas.js. La lógica NO vive aquí.
const { cabecerasCors } = require('../lib/http');
const { ejecutar, ejecutarRecordatorios } = require('../lib/rutas');

function cuerpo(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body;
}

function ipDe(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || (req.socket && req.socket.remoteAddress) || '';
}

function ponCors(req, res) {
  const c = cabecerasCors(req.headers.origin);
  for (const [k, v] of Object.entries(c)) res.setHeader(k, v);
}

function manejarRuta(nombre) {
  return async (req, res) => {
    ponCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (nombre === 'config' && req.method === 'GET') {
      try { return res.status(200).json(await ejecutar('config', {})); }
      catch (e) { return res.status(500).json({ error: e.message }); }
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'usa POST' });
    try {
      const extra = nombre.indexOf('voz-') === 0 ? { ip: ipDe(req), origin: req.headers.origin || '' } : {};
      const r = await ejecutar(nombre, { ...cuerpo(req), ...extra });
      return res.status(200).json(r);
    } catch (e) {
      return res.status(e.code || 500).json({ error: e.message });
    }
  };
}

function manejarRecordatorios() {
  return async (req, res) => {
    ponCors(req, res);
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
