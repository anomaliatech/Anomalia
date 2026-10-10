// Orquesta la conversación con tool calling: la IA decide cuándo ver huecos y cuándo reservar.
const fs = require('fs');
const path = require('path');
const { cargar } = require('../lib/config');
const ia = require('../lib/ia');
const calendario = require('../lib/calendario');
const registro = require('../lib/registro');
const firma = require('../lib/firma');
const email = require('../lib/email');
const { reservar } = require('./reservar');

const MARCA_HUECOS = '[HUECOS]'; // línea interna que viaja en el historial; el widget la oculta
const { MARCA_LEAD, leadDe, yaAvisado } = require('./lead-perdido'); // datos de un visitante que aún no ha reservado (firmados)

// Fallos de la IA que no se arreglan solos (clave mala, sin saldo, límite de gasto
// de la clave): el chat sigue contestando con el contacto humano, pero el equipo
// tiene que enterarse. Un email cada 6 horas como mucho, no uno por visitante.
async function avisarIaCaida(negocio, e) {
  const permanente = [401, 402, 403].includes(e.status) || /^Falta /.test(e.message || '');
  if (!permanente || await yaAvisado('aviso:ia-caida', 6 * 3600)) return;
  const dest = process.env.EMAIL_AVISOS || negocio.emailAvisos;
  if (!dest) return;
  await email.enviar({
    para: dest,
    asunto: 'El chat de la web no puede responder - revisa la IA',
    texto: 'El chat de ' + (negocio.nombre || 'la web') + ' está contestando con el mensaje de contacto porque la IA ha fallado:\n\n'
      + String(e.message || '').slice(0, 500)
      + '\n\nSi pone 402 o 403, suele ser saldo o límite de gasto de la clave en openrouter.ai (Credits / Keys). Si pone 401, la clave no es válida.'
      + '\nNo se repetirá este aviso en 6 horas.',
  });
}

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
Tienes tres herramientas: "ver_huecos", "reservar_cita" y "solicitar_llamada".
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
- MIENTRAS "ver_huecos" te devuelva al menos un hueco, NUNCA digas que ese día o esa
  hora "está completo" ni "no hay disponibilidad": ofrécele lo que hay. Solo puedes
  decir que no hay hueco si la lista vuelve vacía o con "error".
- Las citas pueden empezar a y media o a y cuarto (14:30, 17:15...), no solo en horas
  en punto. Si el visitante pide una hora así, pásasela a "ver_huecos" tal cual.
- Si un hueco viene con "exacto": true, es JUSTO la fecha y hora que pidió el visitante
  y está libre: ofrécesela directamente como disponible, sin buscarle alternativas ni
  decir que mejor a otra hora.
- No llames a "ver_huecos" otra vez si el visitante no te ha dado una fecha/hora nueva
  o distinta a la de la última vez (por ejemplo, si solo confirma un hueco que ya le
  ofreciste, o responde a otra pregunta): en ese caso sigue con la conversación o pasa
  a "reservar_cita", sin repetir la consulta de disponibilidad.
- Datos obligatorios antes de reservar: ${obligatorios}. El email es opcional: pídelo
  una sola vez para la confirmación y, si no lo dan, sigues sin él. La empresa no se
  pide; si la dicen, la apuntas.
- Tercera herramienta: "solicitar_llamada". Si el visitante prefiere que le llamemos
  (o no quiere elegir hora), NO llames a "ver_huecos": pide nombre y teléfono y llama a
  "solicitar_llamada". Dile que le llamamos en menos de 24 h laborables.
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
    {
      name: 'solicitar_llamada',
      description: 'Para cuando el visitante prefiere que le llamemos en vez de elegir un hueco. Deja aviso al equipo con su nombre y teléfono.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          telefono: { type: 'string' },
          servicio: { type: 'string', description: 'Servicio que le interesa, si lo ha dicho' },
          cuando: { type: 'string', description: 'Cuándo le viene bien que le llamen, si lo ha dicho' },
        },
        required: ['nombre', 'telefono'],
      },
    },
  ];
}

// Teléfono con al menos 9 cifras (admite espacios, puntos, guiones y +34).
function telefonoValido(t) {
  const d = String(t || '').replace(/\D/g, '');
  return d.length >= 9 && d.length <= 15;
}

// El historial que viaja al navegador: solo turnos de texto + las líneas [HUECOS].
function aHistorialPublico(mensajes) {
  return mensajes
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content)
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content }));
}

// Los huecos ofrecidos viajan en el historial del navegador FIRMADOS (HMAC): así
// "reservar_cita" solo acepta huecos que el servidor ofreció de verdad.
function lineaHuecos(huecos) {
  return MARCA_HUECOS + JSON.stringify({ huecos, firma: firma.firmar(huecos) });
}

// Datos de contacto que el visitante ha dado pero que aún no han acabado en cita ni
// en llamada. Viajan firmados en el historial ([LEAD]) para que, si cierra la página,
// el widget pueda pedir el aviso de "casi cliente" sin que nadie pueda inventárselo.
function lineaLead(lead) {
  return MARCA_LEAD + JSON.stringify({ lead, firma: firma.firmar(lead) });
}
const RE_TEL = /(?:\+?\d[\d .\-]{7,}\d)/g;
const RE_EMAIL = /[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}/i;
function fusionarLead(base, extra) {
  const out = Object.assign({}, base || {});
  for (const k of ['nombre', 'telefono', 'email', 'servicio']) {
    const v = extra && extra[k] != null ? String(extra[k]).trim().slice(0, 120) : '';
    if (v && !out[k]) out[k] = v;
  }
  return out;
}
// Lo que el visitante escribió tal cual, por si el modelo aún no ha llamado a ninguna herramienta.
function leadEnTexto(texto) {
  const out = {};
  for (const m of String(texto).match(RE_TEL) || []) {
    const d = m.replace(/\D/g, '');
    if (d.length >= 9 && d.length <= 15) { out.telefono = m.trim(); break; }
  }
  const e = String(texto).match(RE_EMAIL);
  if (e) out.email = e[0];
  return out;
}

function ultimosHuecos(historial) {
  for (let i = historial.length - 1; i >= 0; i--) {
    const c = String(historial[i].content || '');
    if (c.startsWith(MARCA_HUECOS)) {
      try {
        const j = JSON.parse(c.slice(MARCA_HUECOS.length));
        if (Array.isArray(j)) return firma.verificar(j, null) ? j : []; // formato antiguo, sin firma
        if (j && Array.isArray(j.huecos) && firma.verificar(j.huecos, j.firma)) return j.huecos;
      } catch { /* línea corrupta */ }
      return [];
    }
  }
  return [];
}

async function chat({ sessionId, historial = [], mensaje }) {
  const negocio = cargar();
  const id = sessionId || 'sin-id';

  // El registro de eventos nunca retrasa la respuesta: se acumula y se espera al
  // final (en serverless no se puede dejar colgando una promesa tras responder).
  const pendientes = [];
  const anota = (tipo, datos) => pendientes.push(registro.anota(tipo, datos).catch(() => {}));
  const terminar = async (respuesta) => { await Promise.allSettled(pendientes); return respuesta; };

  if (historial.filter((m) => m.role === 'user').length === 0) anota('conversacion_inicio', { sessionId: id });

  const system = promptSistema(negocio);
  const tools = herramientas(negocio);
  let huecosOfrecidos = ultimosHuecos(historial);
  let leadParcial = fusionarLead(leadDe(historial), leadEnTexto(mensaje)); // datos dados en turnos anteriores + en este
  let llamadaHecha = false; // aviso de "llámame" enviado en esta vuelta
  let citaDatos = null; // inicio/fin/servicio de la cita creada, para el botón "añadir a mi calendario"
  let citaHecha = null; // si se reserva en esta vuelta, guardamos el "cuando" para poder confirmar aunque falle la IA
  let conEmail = false; // solo se promete el correo de confirmación si dejó email

  // reconstruye el hilo para la IA (sin las líneas [HUECOS], que no son turnos de chat)
  const mensajes = historial
    .filter((m) => { const c = String(m.content || ''); return !c.startsWith(MARCA_HUECOS) && !c.startsWith(MARCA_LEAD); })
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
  mensajes.push({ role: 'user', content: String(mensaje || '') });

  const respuesta = (reply, msgs) => {
    const pub = aHistorialPublico(msgs);
    if (huecosOfrecidos.length) pub.push({ role: 'assistant', content: lineaHuecos(huecosOfrecidos) });
    const r = { reply, historial: pub };
    // Con cita o llamada ya no hay nada que rescatar: la línea [LEAD] desaparece.
    if (!citaHecha && !llamadaHecha && (leadParcial.telefono || leadParcial.email)) {
      pub.push({ role: 'assistant', content: lineaLead(leadParcial) });
      r.leadPendiente = true;
    }
    if (citaHecha) r.cita = Object.assign({ tipo: 'cita', cuando: citaHecha }, citaDatos || {}); // el frontend dispara la conversión de Ads con esto
    else if (llamadaHecha) r.cita = { tipo: 'llamada' };
    return r;
  };

  for (let vuelta = 0; vuelta < 5; vuelta++) {
    let resp;
    try {
      resp = await ia.responder({ system, messages: mensajes, tools });
    } catch (e) {
      anota('error', { sessionId: id, donde: 'ia', msg: e.message });
      pendientes.push(avisarIaCaida(negocio, e).catch(() => {}));
      // Si la cita YA se creó en esta vuelta, confirma igualmente (no dependas de la IA).
      let reply;
      if (citaHecha) reply = textoCitaHecha(citaHecha, conEmail);
      else if (e.status === 429 || e.status === 504) reply = 'Tengo mucho lío ahora mismo, dame unos segundos y vuelve a escribirme.';
      else reply = 'Ahora mismo no puedo atenderte bien. ' + (negocio.mensajeHumano || '');
      return terminar(respuesta(reply, [...mensajes, { role: 'assistant', content: reply }]));
    }

    if (!resp.toolCalls || resp.toolCalls.length === 0) {
      // El widget pinta texto plano: unas **negritas** saldrían con los asteriscos.
      const texto = (resp.text || 'Perdona, ¿me lo repites?').replace(/\*\*(.+?)\*\*/g, '$1');
      mensajes.push({ role: 'assistant', content: texto });
      return terminar(respuesta(texto, mensajes));
    }

    mensajes.push({ role: 'assistant', content: resp.text, toolCalls: resp.toolCalls });

    for (const tc of resp.toolCalls) {
      let resultado;
      if (tc.name === 'ver_huecos') {
        try {
          const dur = duracionServicio(negocio, tc.args.servicio);
          const libres = await calendario.huecosLibres(negocio, { duracionMin: dur, preferencia: tc.args.preferencia });
          huecosOfrecidos = libres.slice(0, 6).map((h, i) => ({ id: i, cuando: h.etiqueta, inicio: h.inicio, exacto: !!h.exacto }));
          anota('disponibilidad_mostrada', { sessionId: id, n: libres.length });
          resultado = { huecos: huecosOfrecidos.map((h) => (h.exacto ? { id: h.id, cuando: h.cuando, exacto: true } : { id: h.id, cuando: h.cuando })) };
        } catch (e) {
          anota('error', { sessionId: id, donde: 'disponibilidad', msg: e.message });
          resultado = { error: 'No se pudieron consultar los huecos.' };
        }
      } else if (tc.name === 'reservar_cita') {
        // El esquema pide "servicio" como argumento de primer nivel, pero negocio.json
        // lo lista además como campo obligatorio del lead: sin esto la reserva se
        // rechazaba pidiendo un dato que el modelo ya había dado, y reintentaba sin parar.
        const lead = Object.assign({}, tc.args.lead);
        if (tc.args.servicio && !lead.servicio) lead.servicio = tc.args.servicio;
        leadParcial = fusionarLead(leadParcial, { nombre: lead.nombre, telefono: lead.telefono, email: lead.email, servicio: tc.args.servicio });
        const faltan = (negocio.camposLead || []).filter((c) => c.obligatorio && !lead[c.id]);
        const hueco = huecosOfrecidos[Number(tc.args.slotId)];
        if (!faltan.length && lead.telefono && !telefonoValido(lead.telefono)) {
          resultado = { error: 'El teléfono no parece válido (hacen falta 9 cifras). Pídeselo de nuevo.' };
        } else if (faltan.length) {
          resultado = { error: 'Faltan datos obligatorios: ' + faltan.map((c) => c.etiqueta).join(', ') + '. Pídeselos.' };
        } else if (!hueco) {
          resultado = { error: 'Ese hueco no está en la lista. Llama antes a ver_huecos.' };
        } else if (!huecoHablado(negocio, hueco, mensajes)) {
          resultado = { error: `El visitante no ha visto ni elegido ese hueco (${hueco.cuando}). Ofréceselo y espera a que diga que sí antes de reservar.` };
        } else {
          try {
            const r = await reservar({ negocio, inicioISO: hueco.inicio, servicio: tc.args.servicio, lead, sessionId: id });
            resultado = { ok: true, cuando: r.etiqueta };
            citaHecha = r.etiqueta;
            conEmail = !!lead.email;
            const iniMs = new Date(hueco.inicio).getTime();
            citaDatos = {
              inicio: new Date(iniMs).toISOString(),
              fin: new Date(iniMs + duracionServicio(negocio, tc.args.servicio) * 60000).toISOString(),
              servicio: String(tc.args.servicio || '').slice(0, 80),
            };
          } catch (e) {
            anota('error', { sessionId: id, donde: 'reservar', msg: e.message });
            if (e.code === 409) {
              // Otro visitante se adelantó (o el hueco quedó demasiado cerca): no es un
              // fallo, es que hay que ofrecer otro. La lista antigua deja de valer.
              huecosOfrecidos = [];
              resultado = { error: 'Ese hueco se acaba de ocupar. Llama a ver_huecos otra vez y ofrécele los nuevos huecos más cercanos, pidiendo disculpas.' };
            } else {
              resultado = { error: 'No se pudo crear la cita. Ofrece: ' + (negocio.mensajeHumano || 'otra vía de contacto') };
            }
          }
        }
      } else if (tc.name === 'solicitar_llamada') {
        const nombre = String(tc.args.nombre || '').trim().slice(0, 120);
        const telefono = String(tc.args.telefono || '').trim().slice(0, 40);
        leadParcial = fusionarLead(leadParcial, { nombre, telefono, servicio: tc.args.servicio });
        if (!nombre) resultado = { error: 'Falta el nombre. Pídeselo.' };
        else if (!telefonoValido(telefono)) resultado = { error: 'El teléfono no parece válido (hacen falta 9 cifras). Pídeselo de nuevo.' };
        else {
          try {
            const dest = process.env.EMAIL_AVISOS || negocio.emailAvisos;
            const p = email.plantillaAvisoLlamada(negocio, { nombre, telefono, servicio: tc.args.servicio, cuando: tc.args.cuando });
            if (dest) await email.enviar({ para: dest, asunto: p.asunto, texto: p.texto });
            anota('llamada_solicitada', { sessionId: id, servicio: tc.args.servicio || null });
            llamadaHecha = true;
            resultado = { ok: true, mensaje: 'Aviso enviado. Dile que le llamamos en menos de 24 h laborables.' };
          } catch (e) {
            anota('error', { sessionId: id, donde: 'llamada', msg: e.message });
            resultado = { error: 'No se pudo dejar el aviso. Ofrece: ' + (negocio.mensajeHumano || 'otra vía de contacto') };
          }
        }
      } else {
        resultado = { error: 'herramienta desconocida' };
      }
      mensajes.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: JSON.stringify(resultado) });
    }
  }

  const cierre = citaHecha
    ? textoCitaHecha(citaHecha, conEmail)
    : 'Creo que ya está todo. ¿Te confirmo algo más?';
  return terminar(respuesta(cierre, [...mensajes, { role: 'assistant', content: cierre }]));
}

// Un hueco solo se reserva si su día Y su hora han salido en la conversación (lo
// ofreció el asistente o lo pidió el visitante). Sin esto, el modelo llegó a
// reservar un hueco de una lista vieja que nadie había mencionado ("¿el jueves a
// las 13?" -> cita el lunes a las 13). Si falla, el modelo pregunta antes: un turno
// de más, nunca una cita que el visitante no ha elegido.
function huecoHablado(negocio, hueco, mensajes) {
  const sinTildes = (t) => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const p = new Intl.DateTimeFormat('es-ES', {
    timeZone: negocio.zonaHoraria, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(hueco.inicio)).reduce((a, x) => ((a[x.type] = sinTildes(x.value)), a), {});
  const texto = sinTildes(mensajes
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => m.content).join(' '));
  const cerca = Math.abs(new Date(hueco.inicio).getTime() - Date.now()) < 2 * 86400000;
  const diaOk = texto.includes(p.weekday) || new RegExp(`\\b${Number(p.day)} de ${p.month}`).test(texto)
    || (cerca && /\b(hoy|manana)\b/.test(texto));
  const h = Number(p.hour);
  const horaOk = p.minute === '00'
    ? new RegExp(`\\b${h}(:00|h|\\b)`).test(texto) || (h > 12 && new RegExp(`\\b${h - 12}\\b`).test(texto))
    : texto.includes(`${h}:${p.minute}`);
  return diaOk && horaOk;
}

function textoCitaHecha(cuando, conEmail) {
  return `¡Listo! Tu cita queda para ${cuando}. ` +
    (conEmail ? 'Te llega la confirmación por email.' : 'Te llamaremos al teléfono que nos has dejado.');
}

function duracionServicio(negocio, nombre) {
  const s = (negocio.servicios || []).find((x) => x.nombre === nombre);
  return (s && s.duracionMin) || negocio.duracionCitaPorDefectoMin || 30;
}

module.exports = { chat, huecoHablado };
