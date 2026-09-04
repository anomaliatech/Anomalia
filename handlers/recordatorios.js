// Manda dos avisos por cita: uno ~24h antes y otro ~2h antes. Cada cita lleva sus
// propios flags en Calendar (recordatorio24Enviado / recordatorio2Enviado), así que
// es idempotente y seguro llamarlo tan a menudo como haga falta.
//
// Ojo con la frecuencia: en el plan gratuito de Vercel el cron solo dispara una vez
// al día, así que el aviso "2 horas antes" no puede quedar preciso solo con eso. Si
// se llama con poca frecuencia, cuando una cita ya está a ≤2h se manda el aviso de
// 2h y se da por perdido (marcado, sin mandar) el de 24h en vez de duplicar avisos
// a la vez. Para que el de 2h llegue de verdad a tiempo hace falta un disparador más
// frecuente: un cron externo gratuito (cron-job.org, UptimeRobot...) golpeando
// POST /api/recordatorios?token=CRON_TOKEN cada 15-30 min.
const { cargar } = require('../lib/config');
const calendario = require('../lib/calendario');
const email = require('../lib/email');

async function recordatorios() {
  const negocio = cargar();
  const ahora = Date.now();
  // Ventana amplia: desde ya mismo (por si el cron llega tarde y una cita ya está
  // dentro de las 2h) hasta 25h por delante (algo de margen sobre las 24h).
  const desde = new Date(ahora);
  const hasta = new Date(ahora + 25 * 3600000);

  const citas = await calendario.citasEntre(negocio, desde, hasta);
  let enviados = 0;
  for (const ev of citas) {
    const priv = (ev.extendedProperties && ev.extendedProperties.private) || {};
    const falta24 = priv.recordatorio24Enviado !== 'si';
    const falta2 = priv.recordatorio2Enviado !== 'si';
    if (!falta24 && !falta2) continue;

    const inicio = new Date(ev.start.dateTime || ev.start.date);
    const horas = (inicio.getTime() - ahora) / 3600000;
    if (horas <= 0) continue; // ya ha pasado o está empezando, no molestar

    const correo = priv.leadEmail;
    const etiqueta = calendario.etiquetaHumana(inicio, negocio.zonaHoraria, negocio.idioma || 'es');
    const nombre = priv.leadNombre || '';

    try {
      if (horas <= 2) {
        const marcar = { recordatorio2Enviado: 'si' };
        if (falta2 && correo) {
          const p = email.plantillaRecordatorio(negocio, { nombre, etiqueta, tipo: '2h' });
          await email.enviar({ para: correo, asunto: p.asunto, html: p.html, texto: p.texto });
          enviados++;
        }
        // Si a estas alturas el de 24h no se mandó (reserva de última hora o cron
        // poco frecuente), no lo mandamos ya pegado al de 2h: se marca sin más.
        if (falta24) marcar.recordatorio24Enviado = 'si';
        await calendario.marcarRecordado(negocio, ev.id, marcar);
      } else if (horas <= 24 && falta24) {
        if (correo) {
          const p = email.plantillaRecordatorio(negocio, { nombre, etiqueta, tipo: '24h' });
          await email.enviar({ para: correo, asunto: p.asunto, html: p.html, texto: p.texto });
          enviados++;
        }
        await calendario.marcarRecordado(negocio, ev.id, { recordatorio24Enviado: 'si' });
      }
    } catch (e) {
      console.warn('[recordatorios] fallo con', ev.id, e.message);
    }
  }
  return { revisados: citas.length, enviados };
}

module.exports = { recordatorios };
