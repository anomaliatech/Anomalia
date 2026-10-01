// Crea la cita en Google Calendar, avisa por email y lo registra.
const { cargar } = require('../lib/config');
const calendario = require('../lib/calendario');
const email = require('../lib/email');
const registro = require('../lib/registro');

async function reservar({ negocio, inicioISO, servicio, lead, sessionId } = {}) {
  const n = negocio || cargar();
  if (!inicioISO) { const e = new Error('Falta inicioISO.'); e.code = 400; throw e; }
  lead = lead || {};

  const faltan = (n.camposLead || []).filter((c) => c.obligatorio && !lead[c.id]).map((c) => c.etiqueta);
  if (faltan.length) {
    const err = new Error('Faltan datos obligatorios: ' + faltan.join(', '));
    err.faltan = faltan;
    err.code = 400;
    throw err;
  }

  const dur = duracion(n, servicio);
  // crearCita revalida el hueco (horario, antelación y ocupación real) y lanza
  // 409 si se acaba de ocupar: la doble reserva no llega a la agenda.
  const cita = await calendario.crearCita(n, { inicioISO, duracionMin: dur, servicio, lead });

  // Todo lo que viene después es "fuego y olvido" con respecto a la cita ya creada:
  // registro y los dos emails salen EN PARALELO, y un fallo en uno no afecta a los
  // demás ni a la respuesta. Antes iban en serie (hasta 4 viajes de red encadenados).
  const tareas = [
    registro.anota('lead_completo', { sessionId, servicio: servicio || null }),
    registro.anota('cita_creada', { sessionId, cuando: cita.inicio, servicio: servicio || null }),
  ];
  if (lead.email) {
    const p = email.plantillaConfirmacion(n, { lead, servicio, etiqueta: cita.etiqueta });
    tareas.push(email.enviar({ para: lead.email, asunto: p.asunto, html: p.html, texto: p.texto })
      .catch((e) => console.warn('[reservar] email al visitante falló:', e.message)));
  }
  const dest = process.env.EMAIL_AVISOS || n.emailAvisos;
  if (dest) {
    const p = email.plantillaAvisoInterno(n, { lead, servicio, etiqueta: cita.etiqueta });
    tareas.push(email.enviar({ para: dest, asunto: p.asunto, texto: p.texto })
      .catch((e) => console.warn('[reservar] aviso interno falló:', e.message)));
  }
  await Promise.allSettled(tareas);

  return { ok: true, eventoId: cita.id, htmlLink: cita.htmlLink, inicio: cita.inicio, etiqueta: cita.etiqueta };
}

function duracion(n, servicio) {
  const s = (n.servicios || []).find((x) => x.nombre === servicio);
  return (s && s.duracionMin) || n.duracionCitaPorDefectoMin || 30;
}

module.exports = { reservar };
