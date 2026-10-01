// ÚNICA fuente de verdad del SEO/GEO del sitio: entidad, páginas, servicios y
// precios. De aquí salen (con `node scripts/generar-seo.js`): el JSON-LD de cada
// página, sitemap.xml, robots.txt, llms.txt, llms-full.txt y about.md.
// Cambiar un precio o un servicio = tocarlo AQUÍ y regenerar. Nada se duplica a mano.
const DOMINIO = 'https://anomalia.business';

const org = {
  id: `${DOMINIO}/#org`,
  nombre: 'Anomalia',
  alias: ['Anomalía', 'Anomalia Estudio Digital'],
  url: `${DOMINIO}/`,
  logo: `${DOMINIO}/assets/icon-512.png`,
  imagen: `${DOMINIO}/assets/og-cover.png`,
  email: 'contacto@anomalia.business',
  telefono: '+34601449173',
  telefonoHumano: '+34 601 44 91 73',
  fundador: 'Marcos Mompeán López',
  pais: 'ES',
  idioma: 'es',
  eslogan: 'No vendemos páginas web. Vendemos negocios que crecen.',
  descripcion:
    'Anomalia es un estudio digital español que diseña páginas web a medida, automatiza procesos con ' +
    'inteligencia artificial y audita negocios para que pymes y autónomos consigan más clientes y ' +
    'pierdan menos horas en tareas manuales. Trabaja 100 % en remoto con negocios de toda España.',
  tipoNegocio: ['ProfessionalService', 'Organization'],
  categorias: ['Diseño web', 'Automatización de procesos', 'Inteligencia artificial aplicada', 'Auditoría de negocio', 'SEO técnico'],
  sectores: ['Restaurantes', 'Clínicas', 'Gimnasios', 'Inmobiliarias', 'Hoteles', 'Comercios', 'Despachos profesionales'],
  horario: 'Lunes a domingo, de 12:00 a 21:00 (hora peninsular española)',
  // Redes/perfiles verificados: añadir aquí cuando existan (LinkedIn, ficha de Google…).
  sameAs: [],
};

const servicios = [
  {
    id: 'paginas-web',
    ruta: '/paginas-web',
    nombre: 'Creación de páginas web a medida',
    tipo: 'Diseño y desarrollo de páginas web',
    resumen: 'Webs rápidas, legales, seguras y visibles en Google, pensadas para convertir visitas en clientes.',
    descripcion:
      'Diseño y desarrollo de páginas web a medida para negocios: restaurantes, tiendas y ecommerce, clínicas y ' +
      'despachos, inmobiliarias, hoteles y landing pages. Cada web sale con SEO técnico de base, textos legales ' +
      '(RGPD/LSSI), rendimiento optimizado y, si hace falta, campañas de Google Ads. El dominio y la web son del cliente.',
    plazo: 'La mayoría de webs están listas en una semana o menos.',
    precio: null, // a presupuesto: nunca se publica cifra
  },
  {
    id: 'automatizacion-ia',
    ruta: '/automatizacion-ia',
    nombre: 'Automatización de procesos con IA para negocios',
    tipo: 'Automatización de procesos con inteligencia artificial',
    resumen: 'Agentes y automatizaciones que atienden, agendan, recuerdan y hacen seguimiento sin que nadie tenga que estar encima.',
    descripcion:
      'Automatización de procesos y desarrollo de soluciones de IA a medida para pymes y autónomos: agente que ' +
      'agenda citas 24/7 desde la web o WhatsApp, recepcionista telefónica con IA, generación de presupuestos y ' +
      'facturas, recordatorios y confirmaciones automáticas, seguimiento de clientes y cualquier tarea repetitiva ' +
      'que hoy se haga a mano.',
    plazo: 'Las automatizaciones se integran en paralelo a la web o justo después del lanzamiento.',
    precio: null,
  },
  {
    id: 'auditoria-negocio',
    ruta: '/auditoria-negocio',
    nombre: 'Auditoría de negocio completa',
    tipo: 'Auditoría de negocio',
    resumen: 'Diagnóstico completo por fuera (web, anuncios, reseñas, competencia) y por dentro (captación, agenda, cobro), con plan de acción.',
    descripcion:
      'Auditoría completa de un negocio por las dos caras: por fuera (web y experiencia de usuario, oferta y precios, ' +
      'textos, recorrido del cliente, redes, anuncios activos, ficha de Google, reputación, coherencia de marca, SEO ' +
      'y competencia) y por dentro (captación, agenda, cobro, comunicación, datos, retención, seguridad y madurez ' +
      'tecnológica). Incluye el cruce de ambas mitades, dos mapas del recorrido del cliente y un plan de acción ' +
      'priorizado. Es el único servicio de Anomalia con precio cerrado.',
    plazo: 'Informe entregado en pocos días desde la primera reunión.',
    precio: {
      moneda: 'EUR',
      ofertas: [
        { nombre: 'Auditoría de negocio completa', precio: 550, nota: 'Auditoría sola, con informe y plan de acción.' },
        { nombre: 'Auditoría + servicio contratado', precio: 450, nota: 'Si a raíz del diagnóstico se encarga a Anomalia la página web o la automatización.' },
      ],
    },
  },
];

const paginas = [
  { ruta: '/', archivo: 'index.html', nombre: 'Inicio', prioridad: '1.0', cambia: 'weekly' },
  { ruta: '/paginas-web', archivo: 'paginas-web.html', nombre: 'Páginas web', prioridad: '0.9', cambia: 'monthly', servicio: 'paginas-web', imagen: `${DOMINIO}/assets/og-paginas-web.jpg` },
  { ruta: '/automatizacion-ia', archivo: 'automatizacion-ia.html', nombre: 'Automatización e IA', prioridad: '0.9', cambia: 'monthly', servicio: 'automatizacion-ia', imagen: `${DOMINIO}/assets/og-automatizacion-ia.jpg` },
  { ruta: '/auditoria-negocio', archivo: 'auditoria-negocio.html', nombre: 'Auditoría de negocio', prioridad: '0.9', cambia: 'monthly', servicio: 'auditoria-negocio', imagen: `${DOMINIO}/assets/og-auditoria-negocio.jpg` },
];

const proceso = [
  ['Diagnóstico', 'Analizamos el negocio, la web actual y dónde se pierden clientes o tiempo cada semana.'],
  ['Propuesta', 'Una solución concreta, con alcance y precio cerrado desde el primer momento.'],
  ['Diseño y desarrollo', 'Creamos la web y las automatizaciones, con revisiones con el cliente en cada fase.'],
  ['Lanzamiento', 'Publicamos, probamos todo a fondo y comprobamos que cada detalle funciona.'],
  ['Acompañamiento', 'Seguimos al lado del cliente con soporte, mejoras y ajustes a medida que el negocio crece.'],
];

const porQue = [
  'Diseño y automatización en el mismo equipo: la web y los procesos que la rodean (citas, recordatorios, seguimiento) se construyen juntos.',
  'Plazos cortos: la mayoría de proyectos están listos en una semana o menos.',
  'Precio cerrado en la propuesta, sin sorpresas; la auditoría tiene precio público (550 €, o 450 € si luego se contrata un servicio).',
  'Cada web sale legal (RGPD/LSSI), segura y con SEO técnico incluido, no como extra.',
  'El dominio, la web y los accesos son siempre del cliente.',
  'Trato directo con quien construye el proyecto, no con un departamento de atención al cliente. Respuesta en menos de 24 h laborables.',
  'Primera cita gratuita y reservable al momento desde la web, mediante un asistente con IA que agenda directamente en la agenda del estudio.',
];

// Bots de buscadores y de IA a los que se les abre la puerta explícitamente.
const botsIA = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Googlebot', 'Bingbot',
  'Applebot', 'Applebot-Extended', 'DuckAssistBot', 'YouBot', 'MistralAI-User', 'Meta-ExternalAgent',
];

module.exports = { DOMINIO, org, servicios, paginas, proceso, porQue, botsIA };
