// Carga negocio.json una sola vez y lo deja disponible para todo el backend.
const fs = require('fs');
const path = require('path');

let cache = null;

function cargar() {
  if (cache) return cache;
  const ruta = path.join(__dirname, '..', 'negocio.json');
  if (!fs.existsSync(ruta)) {
    throw new Error(
      'Falta negocio.json en la raíz del proyecto. Lo genera el kit "generador-agente-citas". ' +
      'Para probar en local puedes copiar negocio.ejemplo.json a negocio.json.'
    );
  }
  const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  const faltan = ['nombre', 'zonaHoraria', 'servicios', 'horarioAtencion', 'calendarioId', 'camposLead']
    .filter((k) => datos[k] == null);
  if (faltan.length) throw new Error('negocio.json incompleto, faltan: ' + faltan.join(', '));
  cache = datos;
  return cache;
}

// Solo lo que es seguro enviar al navegador (nada de calendario, emails ni horarios internos).
function publico() {
  const n = cargar();
  return {
    nombre: n.nombre,
    idioma: n.idioma || 'es',
    servicios: (n.servicios || []).map((s) => ({ nombre: s.nombre, descripcion: s.descripcion || '' })),
    camposLead: n.camposLead || [],
    widget: n.widget || {},
  };
}

module.exports = { cargar, publico };
