// Registro de eventos para el panel de analítica (Entrega 2).
// Si no hay Upstash configurado, no falla: solo deja traza en consola.
// Guarda cada evento en una lista Redis "eventos" (JSON por línea).

const URL_BASE = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const HAY_REGISTRO = Boolean(URL_BASE && TOKEN);

// tipos: 'conversacion_inicio' | 'lead_completo' | 'disponibilidad_mostrada' | 'cita_creada' | 'error'
async function anota(tipo, datos = {}) {
  const evento = { tipo, ts: new Date().toISOString(), ...datos };
  if (!HAY_REGISTRO) {
    console.log('[registro]', JSON.stringify(evento));
    return;
  }
  try {
    await fetch(`${URL_BASE}/rpush/eventos`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(JSON.stringify(evento)),
    });
    await fetch(`${URL_BASE}/ltrim/eventos/-5000/-1`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
  } catch (e) {
    console.warn('[registro] no se pudo anotar:', e.message);
  }
}

async function leerEventos(limite = 5000) {
  if (!HAY_REGISTRO) return [];
  const r = await fetch(`${URL_BASE}/lrange/eventos/-${limite}/-1`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  const j = await r.json();
  return (j.result || []).map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
}

module.exports = { anota, leerEventos, HAY_REGISTRO };
