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
  const ahora = new Intl.DateTimeFormat(negocio.idioma === 'es' || !negocio.idioma ? 'es-ES' : negocio.idioma, {
    timeZone: negocio.zonaHoraria, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date());
  return `${promptBase}

--- Fecha actual (interno) ---
Ahora mismo es ${ahora} (${negocio.zonaHoraria}). Usa esta fecha para hablar de los huecos:
di "hoy" o "mañana" SOLO si de verdad coinciden con esta fecha; si no, di el día tal cual
("el jueves 3 a las 12:00"). Nunca adivines qué día es hoy.

--- Cómo agendas (interno) ---
Tienes dos herramientas: "ver_huecos" y "reservar_cita".
- En cuanto sepas qué servicio quiere el visitante, PREGÚNTALE qué día y a qué hora le
  viene bien. No llames a "ver_huecos" todavía: espera su respuesta.
- Cuando te diga un día y/o una hora (vale aunque sea aproximado: "el jueves", "por la
  tarde", "mañana a primera hora"...), tradúcelo a una fecha y hora concretas con la
  fecha de arriba como referencia, y llama a "ver_huecos" con "preferencia" en formato
  ISO 8601 con la zona horaria de arriba (ej: "2026-09-10T17:00:00+02:00"). Si solo te
  dio el día sin hora, usa las 12:00 de ese día. Si no te dio ninguna preferencia de
  fecha, omite "preferencia" y ya está.
- Si ya sabes el día (te lo dio en un mensaje anterior) y le preguntaste la hora, y
  responde con un número suelto ("12", "17", "a las 10"...), ESO es la hora de ESE
  día — nunca lo reinterpretes como un día del mes distinto ni cambies el día que ya
  tenías. Combina el día que ya sabías con esa hora al construir el ISO.
- No calcules tú a qué número de día del mes cae "el lunes" o "el jueves que viene": es
  fácil equivocarse (decir "lunes 12" cuando el 12 no es lunes) y el visitante lo nota.
  En tus mensajes, refiérete al día como lo dijo el visitante ("el lunes", "el jueves
  que viene") o usa tal cual la etiqueta "cuando" que te devuelve "ver_huecos" (esa sí
  viene calculada bien) — nunca inventes tú mismo la combinación día-de-semana + día-del-mes.
- Recibirás una lista de huecos con "id" y "cuando", ya ordenados de más cercano a más
  lejano a lo que pidió. Ofrécele 2 o 3, los primeros de la lista (nunca menciones el
  "id"). Sé natural explicando el porqué: si su hora exacta no estaba libre, dile que
  le ofreces la más parecida ese mismo día; si todo ese día estaba completo, dile que
  le ofreces los días más cercanos.
- No llames a "ver_huecos" otra vez si el visitante no te ha dado una fecha/hora nueva
  o distinta a la de la última vez (por ejemplo, si solo confirma un hueco que ya le
  ofreciste, o responde a otra pregunta): en ese caso sigue con la conversación o pasa
  a "reservar_cita", sin repetir la consulta de disponibilidad.
- Datos obligatorios antes de reservar: ${obligatorios}. Si alguno es la empresa o
  entidad y el visitante es autónomo o particular, vale con que te diga eso mismo
  ("soy autónomo", "particular") — no hace falta que tenga una empresa de verdad. El
  teléfono, si lo pides como opcional, pídelo una vez con naturalidad, pero si no lo
  dan, sigues sin él.
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
      description: 'Consulta los huecos libres reales del calendario para un servicio, ordenados por cercanía a la fecha/hora que pida el visitante.',
      parameters: {
        type: 'object',
        properties: {
          servicio: { type: 'string', description: 'Nombre del servicio' },
          preferencia: {
            type: 'string',
            description: 'Fecha y hora que pidió el visitante, en ISO 8601 con offset (ej. 2026-09-10T17:00:00+02:00). Si solo dio el día, usa las 12:00. Omite este campo si no dio ninguna preferencia.',
          },
        },
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
          const libres = await calendario.huecosLibres(negocio, { duracionMin: dur, preferencia: tc.args.preferencia });
          huecosOfrecidos = libres.slice(0, 6).map((h, i) => ({ id: i, cuando: h.etiqueta, inicio: h.inicio }));
          await registro.anota('disponibilidad_mostrada', { sessionId: id, n: libres.length });
          resultado = { huecos: huecosOfrecidos.map((h) => ({ id: h.id, cuando: h.cuando })) };
        } catch (e) {
          await registro.anota('error', { sessionId: id, donde: 'disponibilidad', msg: e.message });
          resultado = { error: 'No se pudieron consultar los huecos.' };
        }
      } else if (tc.name === 'reservar_cita') {
        // El esquema pide "servicio" como argumento de primer nivel, pero negocio.json
        // lo lista además como campo obligatorio del lead: sin esto la reserva se
        // rechazaba pidiendo un dato que el modelo ya había dado, y reintentaba sin parar.
        const lead = Object.assign({}, tc.args.lead);
        if (tc.args.servicio && !lead.servicio) lead.servicio = tc.args.servicio;
        const faltan = (negocio.camposLead || []).filter((c) => c.obligatorio && !lead[c.id]);
        const hueco = huecosOfrecidos[Number(tc.args.slotId)];
        if (faltan.length) {
          resultado = { error: 'Faltan datos obligatorios: ' + faltan.map((c) => c.etiqueta).join(', ') + '. Pídeselos.' };
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
