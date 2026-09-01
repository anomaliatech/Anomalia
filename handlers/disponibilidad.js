// Devuelve los próximos huecos libres. La usa el orquestador de chat y sirve para depurar.
const { cargar } = require('../lib/config');
const calendario = require('../lib/calendario');

async function disponibilidad({ servicio, duracionMin } = {}) {
  const negocio = cargar();
  let dur = duracionMin;
  if (!dur && servicio) {
    const s = (negocio.servicios || []).find((x) => x.nombre === servicio);
    dur = s && s.duracionMin;
  }
  const huecos = await calendario.huecosLibres(negocio, { duracionMin: dur });
  return { huecos };
}

module.exports = { disponibilidad };
