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

--- El teléfono, con cuidado (interno) ---
Por teléfono el dato de contacto es el NÚMERO, no el correo.
- EXCEPCIÓN a lo de pedir los opcionales una vez: el email NO se pide por voz. Ni una
  vez. Deletrear correos hablando sale mal siempre y acabáis los dos perdiendo el
  tiempo. Si el visitante te lo ofrece por su cuenta, apúntalo; pero tú no lo pides.
- Pídele el número de teléfono con naturalidad ("¿me dejas un teléfono para
  confirmarte la cita?") y anótalo SOLO en cifras: 600 11 22 33.
- Repíteselo entero en voz alta, en grupos de dos, para que lo confirme antes de
  reservar.
- Si te corrigen, quédate SOLO con el último que te den y vuelve a repetírselo.
  Nunca mezcles trozos del anterior con el nuevo.
- Si hay ruido y no lo pillas, pídeselo despacio, número a número.`;
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

// --- Telefonos dictados de viva voz -------------------------------------
// Un movil espanol se dicta "seiscientos, once, veintidos, treinta y tres", y el
// transcriptor lo escribe con letras tal cual. Las centenas son ambiguas:
// "seiscientos once" son 600 y 11 en ese numero, pero "seiscientos uno" es 601
// en el 601 44 91 73. Se prueban las dos lecturas y gana la que da 9 cifras.
const NUM = {
  cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};

function palabrasANumeros(texto, unirCentenas) {
  const toks = sinAcentos(texto).replace(/[^\w\s+]/g, ' ').split(/\s+/).filter(Boolean);
  const salida = [];
  for (let i = 0; i < toks.length; i++) {
    const v = NUM[toks[i]];
    if (v === undefined) { salida.push(toks[i]); continue; }
    let n = v;
    if (unirCentenas && n >= 100 && NUM[toks[i + 1]] !== undefined && NUM[toks[i + 1]] < 100) {
      n += NUM[toks[i + 1]]; // "seiscientos uno" -> 601
      i++;
    } else if (n >= 30 && n < 100 && n % 10 === 0 && toks[i + 1] === 'y' && NUM[toks[i + 2]] < 10) {
      n += NUM[toks[i + 2]]; // "treinta y tres" -> 33, esta no es ambigua
      i += 2;
    }
    salida.push(String(n));
  }
  return salida.join(' ');
}

const soloDigitos = (s) => String(s == null ? '' : s).replace(/\D/g, '');

// Quita el prefijo de Espana y decide si el numero tiene la pinta de estar entero.
const sinPrefijo = (d) => (d.length === 11 && d.startsWith('34') ? d.slice(2) : d);
const pareceCompleto = (d) => sinPrefijo(d).length === 9;

function normalizarTelefono(valor) {
  const bruto = String(valor == null ? '' : valor).trim();
  if (!bruto) return '';
  const internacional = /^\+/.test(bruto) || /^\s*(mas|más)\s/i.test(bruto);
  const sueltas = soloDigitos(palabrasANumeros(bruto, false));
  const unidas = soloDigitos(palabrasANumeros(bruto, true));
  // Gana la lectura que da un numero espanol completo; si ninguna, la separada.
  let d = pareceCompleto(sueltas) ? sueltas : (pareceCompleto(unidas) ? unidas : sueltas);
  if (!d) return bruto; // no habia numero: que lo cace la validacion
  d = sinPrefijo(d);
  if (d.length === 9) return d.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4'); // formato de aqui
  return (internacional ? '+' : '') + d;
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
  if (l.telefono) l.telefono = normalizarTelefono(l.telefono);
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

  const tel = lead && lead.telefono;
  if (tel && !/^\+?[\d ]{8,20}$/.test(tel)) {
    fallos.push(`el teléfono "${tel}" no se entiende (repíteselo y anota solo los números)`);
  }

  // El email ya no es obligatorio, pero si lo dan tiene que servir para algo.
  const email = lead && lead.email;
  if (email && !RE_EMAIL.test(email)) {
    fallos.push(`el email "${email}" no es válido (tiene que ser algo como nombre@dominio.com)`);
  }

  const servicio = lead && lead.servicio;
  if (servicio && !resolverServicio(negocio, servicio)) {
    fallos.push(`"${servicio}" no es un servicio de la casa (son: ${(negocio.servicios || []).map((s) => s.nombre).join(', ')})`);
  }

  // Un modelo pequeno encadena ver_huecos + reservar_cita en la misma vuelta y
  // se inventa el cliente entero: nombre, telefono y servicio que nadie ha dado.
  // Si el visitante no ha dicho nunca ese dato, no hay cita. Cuando no hay
  // transcripcion que comprobar se deja pasar, para no bloquear a nadie de
  // verdad por un fallo del transcriptor.
  if (dicho) {
    // Las dos lecturas de las centenas, separadas para que no casen a caballo
    // entre una y otra.
    const digitos = soloDigitos(palabrasANumeros(dicho, false)) + '|' + soloDigitos(palabrasANumeros(dicho, true));
    if (tel && !digitos.includes(soloDigitos(tel))) {
      fallos.push(`el visitante nunca ha dado el teléfono "${tel}", no te lo inventes: pídeselo y usa el que te diga`);
    }
    if (email && RE_EMAIL.test(email)) {
      const usuario = soloAlfanum(email.split('@')[0]);
      // Se busca en la transcripcion tal cual y tambien con los "arroba"/"punto"
      // ya convertidos: dictado, "marcos punto momean" solo casa despues de eso.
      const donde = soloAlfanum(dicho) + ' ' + soloAlfanum(aplicarDictado(dicho));
      if (usuario && !donde.includes(usuario)) {
        fallos.push(`el visitante nunca ha dado el email "${email}", no te lo inventes: pídeselo y usa el que te diga`);
      }
    }
  }
  return fallos;
}

module.exports = {
  instrucciones, herramientas, completarLead, problemasLead,
  normalizarEmail, normalizarTelefono, resolverServicio,
};
