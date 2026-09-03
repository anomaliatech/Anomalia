// Orquesta la conversación con tool calling: la IA decide cuándo ver huecos y cuándo reservar.
const { cargar } = require('../lib/config');
const ia = require('../lib/ia');
const calendario = require('../lib/calendario');
const registro = require('../lib/registro');
const agente = require('../lib/agente');
const { reservar } = require('./reservar');

const MARCA_HUECOS = '[HUECOS]'; // línea interna que viaja en el historial; el widget la oculta

// El historial que viaja al navegador: solo turnos de texto + las líneas [HUECOS].
function aHistorialPublico(mensajes) {
  return mensajes
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content)
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content }));
}

function ultimosHuecos(historial) {
  for (let i = historial.length - 1; i >= 0; i--) {
    const c = String(historial[i].content || '');
    if (c.startsWith(MARCA_HUECOS)) {
      try { return JSON.parse(c.slice(MARCA_HUECOS.length)); } catch { return []; }
    }
  }
  return [];
}

async function chat({ sessionId, historial = [], mensaje }) {
  const negocio = cargar();
  const id = sessionId || 'sin-id';
  if (historial.filter((m) => m.role === 'user').length === 0) await registro.anota('conversacion_inicio', { sessionId: id });

  const system = agente.instrucciones(negocio, { canal: 'texto' });
  const tools = agente.herramientas(negocio);
  let huecosOfrecidos = ultimosHuecos(historial);
  let citaHecha = null; // si se reserva en esta vuelta, guardamos el "cuando" para poder confirmar aunque falle la IA

  // reconstruye el hilo para la IA (sin las líneas [HUECOS], que no son turnos de chat)
  const mensajes = historial
    .filter((m) => !String(m.content || '').startsWith(MARCA_HUECOS))
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
  mensajes.push({ role: 'user', content: String(mensaje || '') });

  for (let vuelta = 0; vuelta < 5; vuelta++) {
    let resp;
    try {
      resp = await ia.responder({ system, messages: mensajes, tools });
    } catch (e) {
      await registro.anota('error', { sessionId: id, donde: 'ia', msg: e.message });
      // Si la cita YA se creó en esta vuelta, confirma igualmente (no dependas de la IA).
      let reply;
      if (citaHecha) reply = `¡Listo! Tu cita queda para ${citaHecha}. Recibirás un email de confirmación.`;
      else if (e.status === 429) reply = 'Tengo mucho lío ahora mismo, dame unos segundos y vuelve a escribirme.';
      else reply = 'Ahora mismo no puedo atenderte bien. ' + (negocio.mensajeHumano || '');
      const pub = aHistorialPublico([...mensajes, { role: 'assistant', content: reply }]);
      if (huecosOfrecidos.length) pub.push({ role: 'assistant', content: MARCA_HUECOS + JSON.stringify(huecosOfrecidos) });
      return { reply, historial: pub };
    }

    if (!resp.toolCalls || resp.toolCalls.length === 0) {
      const texto = resp.text || 'Perdona, ¿me lo repites?';
      mensajes.push({ role: 'assistant', content: texto });
      const pub = aHistorialPublico(mensajes);
      if (huecosOfrecidos.length) pub.push({ role: 'assistant', content: MARCA_HUECOS + JSON.stringify(huecosOfrecidos) });
      return { reply: texto, historial: pub };
    }

    mensajes.push({ role: 'assistant', content: resp.text, toolCalls: resp.toolCalls });

    for (const tc of resp.toolCalls) {
      let resultado;
      if (tc.name === 'ver_huecos') {
        try {
          const dur = duracionServicio(negocio, tc.args.servicio);
          const libres = await calendario.huecosLibres(negocio, { duracionMin: dur });
          huecosOfrecidos = libres.slice(0, 6).map((h, i) => ({ id: i, cuando: h.etiqueta, inicio: h.inicio }));
          await registro.anota('disponibilidad_mostrada', { sessionId: id, n: libres.length });
          resultado = { huecos: huecosOfrecidos.map((h) => ({ id: h.id, cuando: h.cuando })) };
        } catch (e) {
          await registro.anota('error', { sessionId: id, donde: 'disponibilidad', msg: e.message });
          resultado = { error: 'No se pudieron consultar los huecos.' };
        }
      } else if (tc.name === 'reservar_cita') {
        const lead = agente.completarLead(tc.args.lead, tc.args.servicio);
        const faltan = agente.faltanObligatorios(negocio, lead);
        const hueco = huecosOfrecidos[Number(tc.args.slotId)];
        if (faltan.length) {
          resultado = { error: 'Faltan datos obligatorios: ' + faltan.join(', ') + '. Pídeselos.' };
        } else if (!hueco) {
          resultado = { error: 'Ese hueco no está en la lista. Llama antes a ver_huecos.' };
        } else {
          try {
            const r = await reservar({ negocio, inicioISO: hueco.inicio, servicio: tc.args.servicio, lead, sessionId: id });
            resultado = { ok: true, cuando: r.etiqueta };
            citaHecha = r.etiqueta;
          } catch (e) {
            await registro.anota('error', { sessionId: id, donde: 'reservar', msg: e.message });
            resultado = { error: 'No se pudo crear la cita. Ofrece: ' + (negocio.mensajeHumano || 'otra vía de contacto') };
          }
        }
      } else {
        resultado = { error: 'herramienta desconocida' };
      }
      mensajes.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: JSON.stringify(resultado) });
    }
  }

  const cierre = 'Creo que ya está todo. ¿Te confirmo algo más?';
  return { reply: cierre, historial: aHistorialPublico([...mensajes, { role: 'assistant', content: cierre }]) };
}

function duracionServicio(negocio, nombre) {
  const s = (negocio.servicios || []).find((x) => x.nombre === nombre);
  return (s && s.duracionMin) || negocio.duracionCitaPorDefectoMin || 30;
}

module.exports = { chat };
