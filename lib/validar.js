// Validación y saneado de lo que llega del navegador. Todo lo que entra al backend
// pasa por aquí ANTES de tocar la IA o el calendario: tipos, tamaños y caracteres.
// Un payload inválido cuesta 0 ms de IA y responde 400.
const { cargar } = require('./config');

function error(msg) { const e = new Error(msg); e.code = 400; throw e; }

// Quita caracteres de control (menos salto de línea y tabulador), recorta y limita longitud.
function texto(v, max) {
  if (v == null) return '';
  if (typeof v !== 'string') v = String(v);
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max).trim();
}

function isoFecha(v, { maxDias = 90 } = {}) {
  if (v == null || v === '') return undefined;
  const s = texto(v, 40);
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) error('Fecha no válida.');
  const ahora = Date.now();
  if (t < ahora - 86400000 || t > ahora + maxDias * 86400000) error('Fecha fuera de rango.');
  return s;
}

function chat(b = {}) {
  const mensaje = texto(b.mensaje, 1000);
  if (!mensaje) error('Falta el mensaje.');
  const sessionId = texto(b.sessionId, 64).replace(/[^A-Za-z0-9_-]/g, '') || 'sin-id';
  let historial = Array.isArray(b.historial) ? b.historial.slice(-40) : [];
  historial = historial
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: texto(m.content, 4000) }))
    .filter((m) => m.content);
  // Presupuesto de contexto: acota el coste por petición aunque el cliente mande
  // un historial enorme. Se descarta por el principio (lo más antiguo).
  let total = historial.reduce((a, m) => a + m.content.length, 0);
  while (total > 16000 && historial.length) total -= historial.shift().content.length;
  return { sessionId, historial, mensaje };
}

function disponibilidad(b = {}) {
  const out = {};
  const servicio = texto(b.servicio, 80);
  if (servicio) out.servicio = servicio;
  if (b.duracionMin != null) {
    const d = Number(b.duracionMin);
    if (!Number.isInteger(d) || d < 15 || d > 240) error('duracionMin debe ser un entero entre 15 y 240.');
    out.duracionMin = d;
  }
  const pref = isoFecha(b.preferencia);
  if (pref) out.preferencia = pref;
  return out;
}

function reservar(b = {}) {
  const negocio = cargar();
  const inicioISO = isoFecha(b.inicioISO);
  if (!inicioISO) error('Falta inicioISO.');
  const servicio = texto(b.servicio, 80);
  const lead = {};
  const permitidos = new Set((negocio.camposLead || []).map((c) => c.id));
  for (const [k, v] of Object.entries(b.lead || {})) {
    if (!permitidos.has(k)) continue;
    const s = texto(v, 200);
    if (s) lead[k] = s;
  }
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) error('El email no es válido.');
  return { inicioISO, servicio, lead };
}

module.exports = { chat, disponibilidad, reservar, texto };
