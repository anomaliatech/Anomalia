// Cerebro compartido del agente de citas: el system prompt y los esquemas de
// herramientas. Lo usan tanto el chat de texto (handlers/chat.js) como la
// recepcionista de voz (handlers/voz.js), para que no haya dos versiones.
const fs = require('fs');
const path = require('path');

let promptBase = null;
function base() {
  if (promptBase == null) {
    const ruta = path.join(__dirname, '..', 'prompt-sistema.md');
    if (!fs.existsSync(ruta)) throw new Error('Falta prompt-sistema.md (lo genera el kit).');
    promptBase = fs.readFileSync(ruta, 'utf8');
  }
  return promptBase;
}

function ahoraTexto(negocio) {
  const idioma = negocio.idioma === 'es' || !negocio.idioma ? 'es-ES' : negocio.idioma;
  return new Intl.DateTimeFormat(idioma, {
    timeZone: negocio.zonaHoraria, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date());
}

// instrucciones(negocio, { canal: 'texto' | 'voz' }) -> string
function instrucciones(negocio, { canal = 'texto' } = {}) {
  const obligatorios = (negocio.camposLead || []).filter((c) => c.obligatorio).map((c) => c.etiqueta).join(', ');
  const comun = `${base()}

--- Fecha actual (interno) ---
Ahora mismo es ${ahoraTexto(negocio)} (${negocio.zonaHoraria}). Usa esta fecha para hablar de los huecos:
di "hoy" o "mañana" SOLO si de verdad coinciden con esta fecha; si no, di el día tal cual
("el jueves 3 a las 12:00"). Nunca adivines qué día es hoy.

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
- No confirmes ninguna cita hasta que "reservar_cita" responda OK. No inventes huecos.
- NUNCA rellenes tú los datos del visitante. El nombre y el email solo pueden ser los
  que él te haya dado en esta misma conversación: si no te los ha dado, pregúntaselos
  y espera su respuesta. Reservar con datos inventados es el peor error posible.
- "ver_huecos" y "reservar_cita" no van seguidas: entre una y otra el visitante tiene
  que elegir hueco y darte sus datos. Después de "ver_huecos", responde y espera.`;

  if (canal !== 'voz') return comun;

  return `${comun}

--- Estás atendiendo por teléfono (interno) ---
El visitante te habla por voz y te oye por un altavoz. Eres la recepción de Anomalía.
- Frases cortas y naturales, como una recepcionista real. Nada de listas, viñetas ni markdown.
- Ofrece como mucho DOS huecos cada vez, dichos en voz alta ("puedo el jueves a las 12
  o el viernes a las 6 de la tarde, ¿cuál te viene mejor?").
- Si no entiendes algo o hay ruido, pide con calma que lo repitan.
- No cuelgues tú: si el visitante se despide, despídete y ya está.

--- El email, con cuidado (interno) ---
Te lo van a dictar hablando, y es el dato que más se tuerce.
- Al anotarlo escríbelo SIEMPRE en formato normal: nombre@dominio.com. Si te lo dictan
  diciendo "arroba" y "punto", tú pones "@" y "."; jamás escribas dentro del correo las
  palabras "arroba", "punto", "guion" ni "guion bajo".
- Antes de reservar, repíteselo entero en voz alta para que lo confirme.
- Si te corrigen ("me he equivocado, es otro"), quédate SOLO con el último que te den y
  vuelve a repetírselo. Nunca mezcles trozos del anterior con el nuevo.
- Si te dicen que está mal dos veces seguidas, pídeselo letra por letra.`;
}

// Esquemas de herramientas (formato neutro; cada proveedor los adapta).
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

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

// Por voz la gente dicta "marcos arroba gmail punto com" y el transcriptor lo
// escribe con todas las letras. Sin esto se guardaba un email invalido: la cita
// se creaba igual, pero la confirmacion reventaba en silencio y el visitante se
// quedaba sin ella. Los de varias palabras van antes que los de una.
const DICTADO = [
  [/\s*\b(?:gui[oó]n\s+bajo|barra\s+baja|underscore)\b\s*/gi, '_'],
  [/\s*\b(?:arroba|at)\b\s*/gi, '@'],
  [/\s*\b(?:punto|dot)\b\s*/gi, '.'],
  [/\s*\b(?:gui[oó]n|hyphen|dash)\b\s*/gi, '-'],
];

// Cambia las palabras dictadas por sus simbolos. Vale para un email suelto y
// tambien para una transcripcion entera.
function aplicarDictado(s) {
  let t = String(s == null ? '' : s).toLowerCase();
  for (const [re, con] of DICTADO) t = t.replace(re, con);
  return t;
}

function normalizarEmail(valor) {
  let s = String(valor == null ? '' : valor).trim().replace(/^[<(]|[>)]$/g, '');
  if (!s) return '';
  if (RE_EMAIL.test(s)) return s.toLowerCase(); // ya venia bien: no lo toques
  s = aplicarDictado(s).replace(/\s+/g, '');
  // Si el transcriptor lo pego todo junto ("marcosarrobagmail.com") los limites
  // de palabra de arriba no casan, asi que hay que buscarlo dentro.
  if (!s.includes('@') && s.includes('arroba')) s = s.replace(/arroba/g, '@');
  return s.replace(/[.,;:]+$/, '');
}

function sinAcentos(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Devuelve el servicio de negocio.json que corresponde, o null. Tolerante con
// las tildes y con el nombre a medias, porque por voz "Auditoria" llega sin
// tilde y bloquear una cita de verdad por eso seria absurdo.
function resolverServicio(negocio, nombre) {
  const n = sinAcentos(nombre);
  if (!n) return null;
  const servicios = negocio.servicios || [];
  return servicios.find((s) => sinAcentos(s.nombre) === n)
    || servicios.find((s) => { const c = sinAcentos(s.nombre); return c.includes(n) || n.includes(c); })
    || null;
}

// El modelo manda el servicio como argumento de primer nivel de "reservar_cita"
// (es lo que dice el esquema), pero negocio.json tambien lo lista como campo
// obligatorio del lead. Sin esto la reserva se rechazaba por "falta el servicio"
// cuando el modelo ya lo habia dicho, y el modelo se quedaba reintentando.
function completarLead(negocio, lead, servicio) {
  const l = {};
  for (const [k, v] of Object.entries(lead || {})) l[k] = typeof v === 'string' ? v.trim() : v;
  if (servicio && !l.servicio) l.servicio = String(servicio).trim();
  if (l.email) l.email = normalizarEmail(l.email);
  // Deja el nombre exacto del catalogo, no el que haya entendido el modelo.
  const s = resolverServicio(negocio, l.servicio);
  if (s) l.servicio = s.nombre;
  return l;
}

// Deja solo letras y numeros, para comparar lo que el visitante dijo o escribio
// con lo que el modelo afirma que le han dado, sin que estorbe un acento, un
// espacio o un "arroba" mal transcrito.
function soloAlfanum(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Problemas del lead, en frases que el modelo pueda leerle al visitante.
// "dicho" es todo lo que el visitante ha escrito o dictado en la conversacion:
// si viene, se usa para comprobar que los datos salen de el y no del modelo.
function problemasLead(negocio, lead, { dicho } = {}) {
  const campos = negocio.camposLead || [];
  const fallos = campos
    .filter((c) => c.obligatorio && !(lead && lead[c.id]))
    .map((c) => `falta ${c.etiqueta.toLowerCase()}`);

  const email = lead && lead.email;
  if (email && !RE_EMAIL.test(email)) {
    fallos.push(`el email "${email}" no es válido (tiene que ser algo como nombre@dominio.com)`);
  }

  const servicio = lead && lead.servicio;
  if (servicio && !resolverServicio(negocio, servicio)) {
    fallos.push(`"${servicio}" no es un servicio de la casa (son: ${(negocio.servicios || []).map((s) => s.nombre).join(', ')})`);
  }

  // Un modelo pequeno encadena ver_huecos + reservar_cita en la misma vuelta y
  // se inventa el cliente entero: nombre, email y servicio que nadie ha dado.
  // Si el visitante no ha nombrado nunca ese email, no hay cita. Cuando no hay
  // transcripcion que comprobar se deja pasar, para no bloquear a nadie de
  // verdad por un fallo del transcriptor.
  if (dicho && email && RE_EMAIL.test(email)) {
    const usuario = soloAlfanum(email.split('@')[0]);
    // Se busca en la transcripcion tal cual y tambien con los "arroba"/"punto"
    // ya convertidos: dictado, "marcos punto momean" solo casa despues de eso.
    const donde = soloAlfanum(dicho) + ' ' + soloAlfanum(aplicarDictado(dicho));
    if (usuario && !donde.includes(usuario)) {
      fallos.push(`el visitante nunca ha dado el email "${email}", no te lo inventes: pídeselo y usa el que te diga`);
    }
  }
  return fallos;
}

module.exports = { instrucciones, herramientas, completarLead, problemasLead, normalizarEmail, resolverServicio };
