// Crea la cita en Google Calendar, avisa por email y lo registra.
const { cargar } = require('../lib/config');
const calendario = require('../lib/calendario');
const email = require('../lib/email');
const registro = require('../lib/registro');

async function reservar({ negocio, inicioISO, servicio, lead, sessionId } = {}) {
  const n = negocio || cargar();
  if (!inicioISO) throw new Error('Falta inicioISO.');
  lead = lead || {};

  const faltan = (n.camposLead || []).filter((c) => c.obligatorio && !lead[c.id]).map((c) => c.etiqueta);
  if (faltan.length) {
    const err = new Error('Faltan datos obligatorios: ' + faltan.join(', '));
    err.faltan = faltan;
    throw err;
  }

  const dur = duracion(n, servicio);
  const cita = await calendario.crearCita(n, { inicioISO, duracionMin: dur, servicio, lead });

  await registro.anota('lead_completo', { sessionId, servicio: servicio || null });
  await registro.anota('cita_creada', { sessionId, cuando: cita.inicio, servicio: servicio || null });

  // Email al visitante (si dejó email)
  if (lead.email) {
    try {
      const p = email.plantillaConfirmacion(n, { lead, servicio, etiqueta: cita.etiqueta });
      await email.enviar({ para: lead.email, asunto: p.asunto, html: p.html, texto: p.texto });
    } catch (e) { console.warn('[reservar] email al visitante falló:', e.message); }
  }
  // Aviso interno
  const dest = process.env.EMAIL_AVISOS || n.emailAvisos;
  if (dest) {
    try {
      const p = email.plantillaAvisoInterno(n, { lead, servicio, etiqueta: cita.etiqueta });
      await email.enviar({ para: dest, asunto: p.asunto, texto: p.texto });
    } catch (e) { console.warn('[reservar] aviso interno falló:', e.message); }
  }

  return { ok: true, eventoId: cita.id, htmlLink: cita.htmlLink, inicio: cita.inicio, etiqueta: cita.etiqueta };
}

function duracion(n, servicio) {
  const s = (n.servicios || []).find((x) => x.nombre === servicio);
  return (s && s.duracionMin) || n.duracionCitaPorDefectoMin || 30;
}

module.exports = { reservar };
