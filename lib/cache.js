// Caché con TTL en dos niveles, sin dependencias:
//   1) memoria de la instancia (0 ms, gratis; en Vercel una instancia caliente
//      atiende cientos de peticiones seguidas, así que absorbe los picos),
//   2) Upstash Redis (REST) si está configurado: compartida entre instancias.
// Además deduplica peticiones concurrentes a la misma clave ("cache stampede"):
// si 50 visitantes piden huecos a la vez, a Google Calendar va UNA sola llamada.
const memoria = new Map();
const enVuelo = new Map();
const MAX_MEM = 500;

function upstash() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

// Varios comandos en UNA petición HTTP (pipeline). Devuelve null si no hay Upstash.
async function comando(cmds, timeoutMs = 1500) {
  const u = upstash();
  if (!u) return null;
  const r = await fetch(`${u.url}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${u.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmds),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`Upstash ${r.status}`);
  return r.json(); // [{ result }, ...] en el mismo orden que cmds
}

function leerMem(clave) {
  const e = memoria.get(clave);
  if (!e) return undefined;
  if (Date.now() > e.expira) { memoria.delete(clave); return undefined; }
  return e.valor;
}

function guardarMem(clave, valor, ttlSeg) {
  if (memoria.size >= MAX_MEM) memoria.delete(memoria.keys().next().value); // la más antigua
  memoria.set(clave, { valor, expira: Date.now() + ttlSeg * 1000 });
}

// recordar(clave, ttlSeg, fn): devuelve el valor cacheado o ejecuta fn() y lo guarda.
// compartido=false -> solo memoria (para cosas que no merecen un viaje a Redis).
async function recordar(clave, ttlSeg, fn, { compartido = true } = {}) {
  const m = leerMem(clave);
  if (m !== undefined) return m;
  if (enVuelo.has(clave)) return enVuelo.get(clave);
  const p = (async () => {
    if (compartido) {
      try {
        const r = await comando([['GET', clave]]);
        const s = r && r[0] && r[0].result;
        if (s) { const v = JSON.parse(s); guardarMem(clave, v, ttlSeg); return v; }
      } catch { /* la caché compartida está caída: seguimos sin ella */ }
    }
    const v = await fn();
    guardarMem(clave, v, ttlSeg);
    if (compartido) comando([['SET', clave, JSON.stringify(v), 'EX', String(ttlSeg)]]).catch(() => {});
    return v;
  })();
  enVuelo.set(clave, p);
  try { return await p; } finally { enVuelo.delete(clave); }
}

function olvidarPrefijo(prefijo) {
  for (const k of memoria.keys()) if (k.startsWith(prefijo)) memoria.delete(k);
}

module.exports = { recordar, olvidarPrefijo, comando, upstash };
