// Firma HMAC sin estado para los huecos que viajan por el historial del chat.
// El historial lo guarda el navegador y vuelve en cada petición: sin firma, un
// cliente podría inyectar una línea [HUECOS] con cualquier "inicio" y reservar
// fuera de horario. Con firma, solo valen los huecos que el servidor ofreció.
// Usa FIRMA_SECRET; si no existe, CRON_TOKEN; si no hay ninguno, no firma (y
// entonces la última defensa es la revalidación del hueco contra el calendario).
const crypto = require('crypto');

function secreto() { return process.env.FIRMA_SECRET || process.env.CRON_TOKEN || ''; }

function firmar(obj) {
  const s = secreto();
  if (!s) return null;
  return crypto.createHmac('sha256', s).update(JSON.stringify(obj)).digest('base64url');
}

function verificar(obj, firma) {
  const s = secreto();
  if (!s) return true;
  const esperada = firmar(obj);
  if (typeof firma !== 'string' || firma.length !== esperada.length) return false;
  return crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
}

module.exports = { firmar, verificar };
