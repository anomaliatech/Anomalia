// Registro de eventos para el panel de analítica.
// Si no hay Upstash configurado, no falla: solo deja traza en consola.
// Guarda cada evento en una lista Redis "eventos" (JSON por línea), RPUSH + LTRIM
// en UNA sola petición (pipeline) y con timeout corto: nunca retrasa la respuesta.
const { comando, upstash } = require('./cache');

// tipos: 'conversacion_inicio' | 'lead_completo' | 'disponibilidad_mostrada' | 'cita_creada' | 'error'
async function anota(tipo, datos = {}) {
  const evento = { tipo, ts: new Date().toISOString(), ...datos };
  if (!upstash()) {
    console.log('[registro]', JSON.stringify(evento));
    return;
  }
  try {
    await comando([['RPUSH', 'eventos', JSON.stringify(evento)], ['LTRIM', 'eventos', '-5000', '-1']]);
  } catch (e) {
    console.warn('[registro] no se pudo anotar:', e.message);
  }
}

async function leerEventos(limite = 5000) {
  if (!upstash()) return [];
  const r = await comando([['LRANGE', 'eventos', String(-limite), '-1']], 5000);
  const lista = (r && r[0] && r[0].result) || [];
  return lista.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
}

module.exports = { anota, leerEventos, get HAY_REGISTRO() { return Boolean(upstash()); } };
