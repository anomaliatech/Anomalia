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
- No confirmes ninguna cita hasta que "reservar_cita" responda OK. No inventes huecos.`;

  if (canal !== 'voz') return comun;

  return `${comun}

--- Estás atendiendo por teléfono (interno) ---
El visitante te habla por voz y te oye por un altavoz. Eres la recepción de Anomalía.
- Frases cortas y naturales, como una recepcionista real. Nada de listas, viñetas ni markdown.
- Ofrece como mucho DOS huecos cada vez, dichos en voz alta ("puedo el jueves a las 12
  o el viernes a las 6 de la tarde, ¿cuál te viene mejor?").
- Cuando te dicten el email, repíteselo deletreado para confirmarlo antes de reservar.
- Si no entiendes algo o hay ruido, pide con calma que lo repitan.
- No cuelgues tú: si el visitante se despide, despídete y ya está.`;
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

module.exports = { instrucciones, herramientas };
