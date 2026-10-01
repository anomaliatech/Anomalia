// Utilidades HTTP compartidas por server.js (portable) y api/*.js (Vercel).
function origenesPermitidos() {
  return (process.env.ORIGENES_PERMITIDOS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// true si el origen puede usar la API. Sin cabecera Origin (curl, cron, pruebas)
// se deja pasar: a esos los frena el límite por IP, no CORS.
function origenAceptado(origen) {
  const permitidos = origenesPermitidos();
  if (permitidos.length === 0 || !origen) return true;
  return permitidos.includes(origen);
}

function cabecerasCors(origen) {
  const ok = origenAceptado(origen);
  return {
    'access-control-allow-origin': ok ? (origen || '*') : 'null',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    'vary': 'origin',
  };
}

// IP real del visitante. En Vercel x-real-ip / x-forwarded-for los pone la
// plataforma (el cliente no puede falsificarlos).
function ipDe(req) {
  const h = (req && req.headers) || {};
  const xff = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  return String(h['x-real-ip'] || xff || (req && req.socket && req.socket.remoteAddress) || '0.0.0.0');
}

function leerJson(req, maxBytes = 64 * 1024) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > maxBytes) req.destroy();
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = { cabecerasCors, leerJson, origenesPermitidos, origenAceptado, ipDe };
