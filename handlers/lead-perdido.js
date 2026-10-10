// "Casi cliente": el visitante dejó teléfono o email en el chat pero no llegó a
// reservar ni a pedir que le llamen. El widget avisa aquí al salir de la página
// (o tras unos minutos sin escribir) y se manda un email al equipo con sus datos
// y la conversación, para llamarle. Solo vale un lead FIRMADO por el servidor
// (línea [LEAD] del historial): nadie puede fabricar avisos desde fuera.
const { cargar } = require('../lib/config');
const firma = require('../lib/firma');
const email = require('../lib/email');
const registro = require('../lib/registro');
const { comando } = require('../lib/cache');

const MARCA_LEAD = '[LEAD]';
const MARCA_HUECOS = '[HUECOS]';
const DEDUP_SEG = 86400; // un aviso por teléfono y día, aunque recargue la página

function leadDe(historial) {
  for (let i = historial.length - 1; i >= 0; i--) {
    const c = String(historial[i].content || '');
    if (!c.startsWith(MARCA_LEAD)) continue;
    try {
      const j = JSON.parse(c.slice(MARCA_LEAD.length));
      if (j && j.lead && firma.verificar(j.lead, j.firma)) return j.lead;
    } catch { /* línea corrupta */ }
    return null;
  }
  return null;
}

// Deduplicación: Upstash si existe (compartida entre instancias); si no, memoria.
const recientes = new Map();
async function yaAvisado(clave, seg = DEDUP_SEG) {
  try {
    const r = await comando([['SET', clave, '1', 'NX', 'EX', String(seg)]]);
    if (r) return r[0].result == null; // null = la clave ya existía
  } catch { /* sin Redis: cae a memoria */ }
  const ahora = Date.now();
  for (const [k, v] of recientes) if (v < ahora) recientes.delete(k);
  if (recientes.has(clave)) return true;
  recientes.set(clave, ahora + seg * 1000);
  return false;
}

function transcripcion(historial) {
  return historial
    .filter((m) => typeof m.content === 'string' && !m.content.startsWith(MARCA_LEAD) && !m.content.startsWith(MARCA_HUECOS))
    .map((m) => (m.role === 'user' ? 'Visitante: ' : 'Asistente: ') + m.content.trim())
    .join('\n')
    .slice(-3000);
}

async function leadPerdido({ sessionId, historial = [], motivo } = {}) {
  const negocio = cargar();
  const lead = leadDe(historial);
  if (!lead || !(lead.telefono || lead.email)) return { ok: true, enviado: false };

  const clave = 'lead:' + (lead.telefono ? String(lead.telefono).replace(/\D/g, '') : String(lead.email).toLowerCase());
  if (await yaAvisado(clave)) return { ok: true, enviado: false };

  const dest = process.env.EMAIL_AVISOS || negocio.emailAvisos;
  let enviado = false;
  if (dest) {
    const p = email.plantillaCasiCliente(negocio, { lead, transcripcion: transcripcion(historial), motivo });
    const r = await email.enviar({ para: dest, asunto: p.asunto, texto: p.texto });
    enviado = Boolean(r && r.enviado);
  }
  await registro.anota('lead_rescatado', { sessionId, servicio: lead.servicio || null, motivo: motivo || null, enviado }).catch(() => {});
  return { ok: true, enviado };
}

module.exports = { leadPerdido, leadDe, yaAvisado, MARCA_LEAD };
