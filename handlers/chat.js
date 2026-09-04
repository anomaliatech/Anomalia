// Orquesta la conversación con tool calling: la IA decide cuándo ver huecos y cuándo reservar.
const { cargar } = require('../lib/config');
const ia = require('../lib/ia');
const calendario = require('../lib/calendario');
const registro = require('../lib/registro');
const agente = require('../lib/agente');
const { reservar } = require('./reservar');

const MARCA_HUECOS = '[HUECOS]'; // línea interna que viaja en el historial; el widget la oculta
const MARCA_CITA = '[CITA]';     // idem: deja constancia de que la cita se creó de verdad

// El modelo pequeño a veces anuncia "cita confirmada" aunque reservar_cita haya
// fallado (o sin haberla llamado siquiera), y el visitante se lo cree y se queda
// esperando. Si no hay cita de verdad, se desmiente aquí.
const DICE_CONFIRMADA = /\b(confirmad[ao]|agendad[ao]|reservad[ao]|apuntad[ao]|queda\s+(?:para|el|la)\b)/i;
const PIDE_DATOS = 'Perdona, todavía no tengo la cita puesta. ¿Me pasas tu nombre, tu email y cuál de los huecos te viene mejor y la dejo cerrada?';

// Se pisa la respuesta del modelo solo si NO hay cita real y (a) intentó reservar
// y no salió, o (b) dice que está hecha cuando no lo está.
function sinFalsaConfirmacion(texto, hayCita, intentoFallido) {
  if (hayCita) return texto;
  if (intentoFallido || DICE_CONFIRMADA.test(texto || '')) return PIDE_DATOS;
  return texto;
}

function yaHabiaCita(historial) {
  return (historial || []).some((m) => String(m.content || '').startsWith(MARCA_CITA));
}

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
  let intentoReservaFallido = false; // se llamó a reservar_cita y no cuajó
  const habiaCita = yaHabiaCita(historial); // ¿se reservó ya en una vuelta anterior?

  // reconstruye el hilo para la IA (sin las líneas internas, que no son turnos de chat)
  const mensajes = historial
    .filter((m) => { const c = String(m.content || ''); return !c.startsWith(MARCA_HUECOS) && !c.startsWith(MARCA_CITA); })
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
  mensajes.push({ role: 'user', content: String(mensaje || '') });

  // El historial que se devuelve al navegador, con las marcas internas al final.
  const publicar = (msgs) => {
    const pub = aHistorialPublico(msgs);
    if (huecosOfrecidos.length) pub.push({ role: 'assistant', content: MARCA_HUECOS + JSON.stringify(huecosOfrecidos) });
    if (citaHecha || habiaCita) pub.push({ role: 'assistant', content: MARCA_CITA + (citaHecha || 'si') });
    return pub;
  };

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
      return { reply, historial: publicar([...mensajes, { role: 'assistant', content: reply }]) };
    }

    if (!resp.toolCalls || resp.toolCalls.length === 0) {
      const texto = sinFalsaConfirmacion(resp.text || 'Perdona, ¿me lo repites?', citaHecha || habiaCita, intentoReservaFallido);
      mensajes.push({ role: 'assistant', content: texto });
      return { reply: texto, historial: publicar(mensajes) };
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
        intentoReservaFallido = true; // se pone a false solo si la reserva sale
        const lead = agente.completarLead(negocio, tc.args.lead, tc.args.servicio);
        // Todo lo que ha escrito el visitante: los datos de la cita tienen que
        // salir de aquí, no de la imaginación del modelo.
        const dicho = mensajes.filter((m) => m.role === 'user').map((m) => m.content).join(' \n ');
        const problemas = agente.problemasLead(negocio, lead, { dicho });
        const hueco = huecosOfrecidos[Number(tc.args.slotId)];
        if (problemas.length) {
          resultado = { error: 'No puedo reservar todavía: ' + problemas.join('; ') + '. Pídeselo.' };
        } else if (!hueco) {
          resultado = { error: 'Ese hueco no está en la lista. Llama antes a ver_huecos.' };
        } else {
          try {
            const r = await reservar({ negocio, inicioISO: hueco.inicio, servicio: lead.servicio, lead, sessionId: id });
            resultado = { ok: true, cuando: r.etiqueta };
            citaHecha = r.etiqueta;
            intentoReservaFallido = false;
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

  const cierre = citaHecha || habiaCita
    ? 'Creo que ya está todo. ¿Te confirmo algo más?'
    : 'Se me ha liado un poco. ¿Me dices tu nombre, tu email y qué hueco te viene bien y cierro la cita?';
  return { reply: cierre, historial: publicar([...mensajes, { role: 'assistant', content: cierre }]) };
}

function duracionServicio(negocio, nombre) {
  const s = (negocio.servicios || []).find((x) => x.nombre === nombre);
  return (s && s.duracionMin) || negocio.duracionCitaPorDefectoMin || 30;
}

module.exports = { chat };
