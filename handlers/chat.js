// Orquesta la conversación con tool calling: la IA decide cuándo ver huecos y cuándo reservar.
const fs = require('fs');
const path = require('path');
const { cargar } = require('../lib/config');
const ia = require('../lib/ia');
const calendario = require('../lib/calendario');
const registro = require('../lib/registro');
const { reservar } = require('./reservar');

const MARCA_HUECOS = '[HUECOS]'; // línea interna que viaja en el historial; el widget la oculta

let promptBase = null;
function promptSistema(negocio) {
  if (promptBase == null) {
    const ruta = path.join(__dirname, '..', 'prompt-sistema.md');
    if (!fs.existsSync(ruta)) throw new Error('Falta prompt-sistema.md (lo genera el kit).');
    promptBase = fs.readFileSync(ruta, 'utf8');
  }
  const obligatorios = (negocio.camposLead || []).filter((c) => c.obligatorio).map((c) => c.etiqueta).join(', ');
  return `${promptBase}

--- Cómo agendas (interno) ---
Tienes dos herramientas: "ver_huecos" y "reservar_cita".
- En cuanto sepas qué servicio quiere el visitante, llama a "ver_huecos". No hace falta
  tener todos sus datos todavía.
- Recibirás una lista de huecos con "id" y "cuando". Ofrécele 2 o 3 por su "cuando"
  (nunca menciones el "id").
- Datos obligatorios antes de reservar: ${obligatorios}. Los demás son opcionales:
  pídelos una vez con naturalidad, pero si no los dan, sigues sin ellos.
- Cuando tengas los datos obligatorios y el visitante haya elegido un hueco, llama a
  "reservar_cita" con el "id" EXACTO de ese hueco.
- No confirmes ninguna cita hasta que "reservar_cita" responda OK. No inventes huecos.`;
}

function herramientas(negocio) {
  const props = {};
  for (const c of negocio.camposLead || []) props[c.id] = { type: 'string', description: c.etiqueta };
  return [
    {
      name: 'ver_huecos',
      description: 'Consulta los huecos libres reales del calendario para un servicio.',
      parameters: {
        type: 'object',
        properties: { servicio: { type: 'string', description: 'Nombre del servicio' } },
        required: ['servicio'],
      },
    },
    {
      name: 'reservar_cita',
      description: 'Crea la cita en el calendario. Solo cuando el visitante ha elegido un hueco de la lista.',
      parameters: {
        type: 'object',
        properties: {
          slotId: { type: 'integer', description: 'id del hueco elegido, de la lista de ver_huecos' },
          servicio: { type: 'string' },
          lead: { type: 'object', properties: props },
        },
        required: ['slotId', 'servicio', 'lead'],
      },
    },
  ];
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

  const system = promptSistema(negocio);
  const tools = herramientas(negocio);
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
        const faltan = (negocio.camposLead || []).filter((c) => c.obligatorio && !(tc.args.lead && tc.args.lead[c.id]));
        const hueco = huecosOfrecidos[Number(tc.args.slotId)];
        if (faltan.length) {
          resultado = { error: 'Faltan datos obligatorios: ' + faltan.map((c) => c.etiqueta).join(', ') + '. Pídeselos.' };
        } else if (!hueco) {
          resultado = { error: 'Ese hueco no está en la lista. Llama antes a ver_huecos.' };
        } else {
          try {
            const r = await reservar({ negocio, inicioISO: hueco.inicio, servicio: tc.args.servicio, lead: tc.args.lead, sessionId: id });
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
