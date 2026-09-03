// Recepcionista de voz (OpenAI Realtime API por WebRTC).
// - sesionVoz:   crea un "client secret" efímero con la sesión ya configurada
//                (voz, instrucciones del agente, herramientas). El navegador lo usa
//                para abrir la conexión WebRTC directamente contra OpenAI.
// - vozHuecos / vozReservar: los ejecuta el navegador cuando el modelo llama a
//                una herramienta. Van protegidos por la firma que devuelve sesionVoz,
//                así no exponemos /api/reservar al navegador sin control.
const crypto = require('crypto');
const { cargar } = require('../lib/config');
const agente = require('../lib/agente');
const firma = require('../lib/firma');
const limite = require('../lib/limite');
const registro = require('../lib/registro');
const { disponibilidad } = require('./disponibilidad');
const { reservar } = require('./reservar');

const OPENAI_CLIENT_SECRETS = 'https://api.openai.com/v1/realtime/client_secrets';

function safeId(ip) {
  return crypto.createHash('sha256').update(String(ip || 'anon')).digest('hex').slice(0, 32);
}

async function sesionVoz({ origin, ip } = {}) {
  const negocio = cargar();
  const clave = process.env.OPENAI_API_KEY;
  if (!clave) { const e = new Error('Falta OPENAI_API_KEY para la recepcionista de voz.'); e.code = 500; throw e; }

  await limite.comprobarVoz(ip); // lanza 429 si se pasa de la cuota

  const vz = negocio.voz || {};
  const modelo = process.env.VOZ_MODELO || vz.modelo || 'gpt-realtime-mini';
  const voz = process.env.VOZ_VOZ || vz.voz || 'marin';
  const vad = process.env.VOZ_VAD || 'semantic_vad';
  const maxMinutos = Number(process.env.VOZ_MAX_MIN || vz.maxMinutos || 5);
  const idioma = negocio.idioma || 'es';

  const tools = agente.herramientas(negocio).map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  const sesion = {
    type: 'realtime',
    model: modelo,
    instructions: agente.instrucciones(negocio, { canal: 'voz' }),
    output_modalities: ['audio'],
    max_output_tokens: 1200,
    tools,
    tool_choice: 'auto',
    audio: {
      input: {
        transcription: { model: 'gpt-4o-mini-transcribe', language: idioma },
        turn_detection: { type: vad },
      },
      output: { voice: voz },
    },
  };

  const r = await fetch(OPENAI_CLIENT_SECRETS, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${clave}`,
      'content-type': 'application/json',
      'openai-safety-identifier': safeId(ip),
    },
    body: JSON.stringify({ expires_after: { anchor: 'created_at', seconds: 120 }, session: sesion }),
  });
  const texto = await r.text();
  if (!r.ok) {
    await registro.anota('error', { donde: 'voz-sesion', msg: `${r.status} ${texto.slice(0, 200)}` });
    const e = new Error(`OpenAI Realtime respondió ${r.status}: ${texto.slice(0, 300)}`);
    e.code = 502;
    throw e;
  }
  const j = JSON.parse(texto);
  const valor = j.value || (j.client_secret && j.client_secret.value);
  if (!valor) { const e = new Error('OpenAI no devolvió el client secret.'); e.code = 502; throw e; }

  const sid = 'vz_' + crypto.randomBytes(7).toString('hex');
  await registro.anota('voz_inicio', { sessionId: sid });

  return {
    client_secret: { value: valor, expires_at: j.expires_at || null },
    model: modelo,
    voice: voz,
    maxMinutos,
    saludo: vz.saludo || `Recepción de ${negocio.nombre}, dime en qué puedo ayudarte.`,
    firma: firma.firmar({ t: 'voz', sid, ip: ip || '', exp: Date.now() + 20 * 60000 }),
  };
}

function sidDeVoz(token) {
  const obj = firma.verificar(token);
  if (obj.t !== 'voz' || !obj.sid) { const e = new Error('Firma de voz no válida.'); e.code = 401; throw e; }
  return obj.sid;
}

async function vozHuecos({ firma: fVoz, servicio } = {}) {
  const sid = sidDeVoz(fVoz);
  if (!servicio) { const e = new Error('Falta el servicio.'); e.code = 400; throw e; }

  const negocio = cargar();
  const nombre = (negocio.servicios || []).map((s) => s.nombre)
    .find((n) => n.toLowerCase() === String(servicio).toLowerCase()) || servicio;

  const { huecos = [] } = await disponibilidad({ servicio: nombre });
  const elegidos = huecos.slice(0, 3).map((h, i) => ({ id: i, cuando: h.etiqueta, inicio: h.inicio }));
  await registro.anota('disponibilidad_mostrada', { sessionId: sid, n: huecos.length });

  return {
    huecos: elegidos.map((h) => ({ id: h.id, cuando: h.cuando })),
    firmaHuecos: firma.firmar({
      t: 'huecos', sid, servicio: nombre,
      slots: elegidos.map((h) => ({ id: h.id, inicio: h.inicio })),
      exp: Date.now() + 20 * 60000,
    }),
  };
}

async function vozReservar({ firma: fVoz, firmaHuecos, slotId, servicio, lead } = {}) {
  const sid = sidDeVoz(fVoz);
  const info = firma.verificar(firmaHuecos);
  if (info.t !== 'huecos' || info.sid !== sid) { const e = new Error('Los huecos no son de esta llamada.'); e.code = 401; throw e; }

  const slot = (info.slots || []).find((s) => Number(s.id) === Number(slotId));
  if (!slot) { const e = new Error('Ese hueco no está en la lista. Vuelve a consultar la disponibilidad.'); e.code = 400; throw e; }

  const negocio = cargar();
  const nombreServicio = servicio || info.servicio;
  const leadCompleto = agente.completarLead(lead, nombreServicio);
  const faltan = agente.faltanObligatorios(negocio, leadCompleto);
  if (faltan.length) {
    const e = new Error('Faltan datos obligatorios: ' + faltan.join(', ') + '. Pideselos al visitante y vuelve a intentarlo.');
    e.code = 400;
    throw e;
  }

  const r = await reservar({
    inicioISO: slot.inicio,
    servicio: nombreServicio,
    lead: leadCompleto,
    sessionId: sid,
  });
  return { ok: true, cuando: r.etiqueta, htmlLink: r.htmlLink };
}

module.exports = { sesionVoz, vozHuecos, vozReservar };
