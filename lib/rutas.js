// Un único sitio donde vive el "qué hace cada ruta". server.js y api/*.js llaman aquí.
const { chat } = require('../handlers/chat');
const { disponibilidad } = require('../handlers/disponibilidad');
const { reservar } = require('../handlers/reservar');
const { recordatorios } = require('../handlers/recordatorios');
const { sesionVoz, vozHuecos, vozReservar } = require('../handlers/voz');
const { publico } = require('./config');

async function ejecutar(nombre, payload = {}) {
  switch (nombre) {
    case 'chat': return chat(payload);
    case 'disponibilidad': return disponibilidad(payload);
    case 'reservar': return reservar(payload);
    case 'config': return publico();
    case 'voz-sesion': return sesionVoz(payload);
    case 'voz-huecos': return vozHuecos(payload);
    case 'voz-reservar': return vozReservar(payload);
    default: { const e = new Error('ruta desconocida: ' + nombre); e.code = 404; throw e; }
  }
}

// Recordatorios va aparte: lo dispara un cron, con token.
async function ejecutarRecordatorios(tokenRecibido, esCronVercel) {
  const esperado = process.env.CRON_TOKEN;
  if (!esCronVercel && (!esperado || tokenRecibido !== esperado)) {
    const e = new Error('token inválido'); e.code = 401; throw e;
  }
  return recordatorios();
}

module.exports = { ejecutar, ejecutarRecordatorios };
