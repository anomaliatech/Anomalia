// Firma HMAC sin estado para la recepcionista de voz.
// Sirve para que /api/voz-huecos y /api/voz-reservar confíen en datos que
// pasaron antes por /api/voz-sesion, sin necesidad de almacén de sesión.
// Sin dependencias: crypto nativo.
const crypto = require('crypto');

function secreto() {
  const s = process.env.VOZ_SECRET;
  if (!s || s.length < 16) {
    const e = new Error('Falta VOZ_SECRET (texto largo aleatorio) para la recepcionista de voz.');
    e.code = 500;
    throw e;
  }
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// firmar(obj) -> "<payloadB64>.<hmacB64>"
function firmar(obj) {
  const payload = b64url(JSON.stringify(obj));
  const mac = b64url(crypto.createHmac('sha256', secreto()).update(payload).digest());
  return `${payload}.${mac}`;
}

// verificar(token) -> obj  (lanza si la firma no cuadra o ha caducado)
function verificar(token) {
  const err = (m) => { const e = new Error(m); e.code = 401; return e; };
  if (typeof token !== 'string' || token.indexOf('.') < 0) throw err('Firma ausente o mal formada.');
  const [payload, mac] = token.split('.');
  const esperado = b64url(crypto.createHmac('sha256', secreto()).update(payload).digest());
  const a = Buffer.from(mac || '');
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw err('Firma inválida.');
  let obj;
  try { obj = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); }
  catch { throw err('Firma ilegible.'); }
  if (obj.exp && Date.now() > obj.exp) throw err('La sesión de voz ha caducado. Vuelve a llamar.');
  return obj;
}

module.exports = { firmar, verificar };
