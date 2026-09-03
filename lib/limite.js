// Límite de uso para la recepcionista de voz (cada llamada cuesta dinero).
// Con Upstash configurado (mismas variables que lib/registro.js) el conteo es
// real y compartido entre instancias; sin él, un Map en memoria best-effort.
const crypto = require('crypto');

const URL_BASE = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const HAY_REDIS = Boolean(URL_BASE && TOKEN);

const memoria = new Map(); // clave -> { n, reinicia }

function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
}

async function redisIncr(clave, ventanaSeg) {
  const r = await fetch(`${URL_BASE}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify([['INCR', clave], ['EXPIRE', clave, ventanaSeg, 'NX']]),
  });
  const j = await r.json();
  return Number(Array.isArray(j) ? j[0]?.result : j.result) || 0;
}

function memIncr(clave, ventanaSeg) {
  const ahora = Date.now();
  let e = memoria.get(clave);
  if (!e || ahora > e.reinicia) { e = { n: 0, reinicia: ahora + ventanaSeg * 1000 }; memoria.set(clave, e); }
  e.n += 1;
  if (memoria.size > 5000) for (const [k, v] of memoria) if (ahora > v.reinicia) memoria.delete(k);
  return e.n;
}

async function contar(clave, ventanaSeg) {
  try {
    return HAY_REDIS ? await redisIncr(clave, ventanaSeg) : memIncr(clave, ventanaSeg);
  } catch (e) {
    console.warn('[limite] fallo contando, se deja pasar:', e.message);
    return 0;
  }
}

function huella(ip) {
  return crypto.createHash('sha256').update(String(ip || 'anon')).digest('hex').slice(0, 16);
}

// Lanza un error 429 si se supera el tope por IP/hora o el tope global/día.
async function comprobarVoz(ip) {
  const porIpHora = num(process.env.VOZ_SESIONES_IP_HORA, 3);
  const porDia = num(process.env.VOZ_SESIONES_DIA, 60);
  const dia = new Date().toISOString().slice(0, 10);

  const nIp = await contar(`voz:ip:${huella(ip)}:${new Date().toISOString().slice(0, 13)}`, 3600);
  if (nIp > porIpHora) {
    const e = new Error('Has hecho varias llamadas seguidas. Prueba de nuevo dentro de un rato o escríbenos a contacto@anomalia.business.');
    e.code = 429;
    throw e;
  }
  const nDia = await contar(`voz:global:${dia}`, 86400);
  if (nDia > porDia) {
    const e = new Error('La recepción está saturada ahora mismo. Escríbenos a contacto@anomalia.business y te atendemos.');
    e.code = 429;
    throw e;
  }
}

module.exports = { comprobarVoz };
