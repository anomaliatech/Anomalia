// Recorre las citas del agente que empiezan dentro de ~20-28 h y aún no tienen
// recordatorio enviado, manda el email y las marca. Idempotente: seguro correrlo cada hora.
const { cargar } = require('../lib/config');
const calendario = require('../lib/calendario');
const email = require('../lib/email');

async function recordatorios() {
  const negocio = cargar();
  const ahora = Date.now();
  const desde = new Date(ahora + 18 * 3600000);
  const hasta = new Date(ahora + 30 * 3600000);

  const citas = await calendario.citasEntre(negocio, desde, hasta);
  let enviados = 0;
  for (const ev of citas) {
    const priv = (ev.extendedProperties && ev.extendedProperties.private) || {};
    if (priv.recordatorioEnviado === 'si') continue;
    const correo = priv.leadEmail;
    if (!correo) { await calendario.marcarRecordado(negocio, ev.id); continue; }
    const inicio = new Date(ev.start.dateTime || ev.start.date);
    const etiqueta = calendario.etiquetaHumana(inicio, negocio.zonaHoraria, negocio.idioma || 'es');
    const p = email.plantillaRecordatorio(negocio, { nombre: priv.leadNombre || '', etiqueta });
    try {
      await email.enviar({ para: correo, asunto: p.asunto, html: p.html, texto: p.texto });
      await calendario.marcarRecordado(negocio, ev.id);
      enviados++;
    } catch (e) {
      console.warn('[recordatorios] fallo con', ev.id, e.message);
    }
  }
  return { revisados: citas.length, enviados };
}

module.exports = { recordatorios };
