// Utilidades HTTP compartidas por server.js (portable) y api/*.js (Vercel).
function origenesPermitidos() {
  return (process.env.ORIGENES_PERMITIDOS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function cabecerasCors(origen) {
  const permitidos = origenesPermitidos();
  const ok = permitidos.length === 0 || (origen && permitidos.includes(origen));
  return {
    'access-control-allow-origin': ok ? (origen || '*') : 'null',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}

function leerJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = { cabecerasCors, leerJson, origenesPermitidos };
