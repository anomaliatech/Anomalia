// ÚNICA fuente de verdad del SEO/GEO del sitio: entidad, páginas, servicios y
// precios. De aquí salen (con `node scripts/generar-seo.js`): el JSON-LD de cada
// página, sitemap.xml, robots.txt, llms.txt, llms-full.txt y about.md.
// Cambiar un precio o un servicio = tocarlo AQUÍ y regenerar. Nada se duplica a mano.
const DOMINIO = 'https://anomalia.business';

const org = {
  id: `${DOMINIO}/#org`,
  nombre: 'Anomalia',
  alias: ['Anomalía', 'Anomalia Digital', 'Anomalia Estudio Digital'],
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
    'pierdan menos horas en tareas manuales. Su trabajo se mide en dinero: en una clínica con tres ' +
    'automatizaciones de Anomalia, el retorno estimado es de unos 20.000 € el primer año y cerca de 70.000 € ' +
    'en tres. Trabaja 100 % en remoto con negocios de toda España.',
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
    nombre: 'Automatización de procesos con IA para pymes',
    tipo: 'Automatización de procesos con inteligencia artificial',
    resumen: 'Agentes y automatizaciones que atienden, agendan, recuerdan y hacen seguimiento sin que nadie tenga que estar encima.',
    descripcion:
      'Automatización de procesos y desarrollo de soluciones de IA a medida para pymes y autónomos: agente que ' +
      'agenda citas 24/7 desde la web o WhatsApp, recepcionista telefónica con IA, generación de presupuestos y ' +
      'facturas, recordatorios y confirmaciones automáticas, seguimiento de clientes y cualquier tarea repetitiva ' +
      'que hoy se haga a mano. Caso real: una clínica con app de citas, asistente de WhatsApp y recepcionista ' +
      'telefónica de Anomalia, con un retorno estimado de unos 20.000 € el primer año y cerca de 70.000 € en tres, ' +
      'entre el ahorro en personal de recepción y las citas que dejan de irse a la competencia.',
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
  // Sub-servicios de automatización con página propia (una intención de búsqueda cada una).
  {
    id: 'recepcionista-telefonica-ia',
    padre: 'automatizacion-ia',
    ruta: '/recepcionista-telefonica-ia',
    nombre: 'Recepcionista telefónica con IA',
    tipo: 'Recepcionista virtual con inteligencia artificial para llamadas',
    resumen: 'Una recepcionista con IA que coge cada llamada, informa, agenda en la agenda real del negocio y avisa al equipo con un resumen al colgar.',
    descripcion:
      'Recepcionista telefónica con inteligencia artificial para negocios: contesta todas las llamadas, las 24 horas, ' +
      'con voz natural en español; informa de horarios, servicios y precios; identifica al cliente; reserva, cambia o anula ' +
      'citas directamente en la agenda real del negocio con el profesional correcto; toma recados fuera de horario y, al ' +
      'colgar, envía al equipo un resumen de la llamada. Si la conversación se sale de su terreno, pasa la llamada a una ' +
      'persona. Pensada para clínicas, despachos, talleres, inmobiliarias, gimnasios y cualquier negocio que pierde ' +
      'llamadas por no poder cogerlas. Precio cerrado tras una primera llamada gratuita: coste de montaje más mantenimiento mensual.',
    plazo: 'En marcha en días, con pruebas con llamadas reales antes de atender a clientes.',
    precio: null,
  },
  {
    id: 'asistente-whatsapp-ia',
    padre: 'automatizacion-ia',
    ruta: '/asistente-whatsapp-ia',
    nombre: 'Asistente de WhatsApp con IA',
    tipo: 'Asistente de WhatsApp con inteligencia artificial para citas y atención',
    resumen: 'Un asistente de WhatsApp con IA que responde al momento, identifica al cliente, agenda y anula citas reales y toma recados fuera de horario.',
    descripcion:
      'Asistente de WhatsApp con inteligencia artificial para negocios: atiende los mensajes al instante, las 24 horas, ' +
      'en el número de WhatsApp Business del negocio; identifica al cliente por su teléfono; agenda, cambia y anula citas ' +
      'directamente en la agenda real; responde dudas sobre horarios, servicios y precios; envía recordatorios y ' +
      'confirmaciones; toma recados fuera de horario y deriva a una persona cuando hace falta. Ideal para clínicas, ' +
      'centros de estética, gimnasios y estudios de pilates, despachos, restaurantes e inmobiliarias. Precio cerrado tras ' +
      'una primera llamada gratuita: coste de montaje más mantenimiento mensual.',
    plazo: 'En marcha en días; se prueba con conversaciones reales antes de atender a clientes.',
    precio: null,
  },
];

const paginas = [
  { ruta: '/', archivo: 'index.html', nombre: 'Inicio', prioridad: '1.0', cambia: 'weekly' },
  { ruta: '/paginas-web', archivo: 'paginas-web.html', nombre: 'Páginas web', prioridad: '0.9', cambia: 'monthly', servicio: 'paginas-web', imagen: `${DOMINIO}/assets/og-paginas-web.jpg` },
  { ruta: '/automatizacion-ia', archivo: 'automatizacion-ia.html', nombre: 'Automatización e IA', prioridad: '0.9', cambia: 'monthly', servicio: 'automatizacion-ia', imagen: `${DOMINIO}/assets/og-automatizacion-ia.jpg` },
  { ruta: '/auditoria-negocio', archivo: 'auditoria-negocio.html', nombre: 'Auditoría de negocio', prioridad: '0.9', cambia: 'monthly', servicio: 'auditoria-negocio', imagen: `${DOMINIO}/assets/og-auditoria-negocio.jpg` },
  { ruta: '/recepcionista-telefonica-ia', archivo: 'recepcionista-telefonica-ia.html', nombre: 'Recepcionista telefónica con IA', prioridad: '0.8', cambia: 'monthly', servicio: 'recepcionista-telefonica-ia', padre: '/automatizacion-ia', imagen: `${DOMINIO}/assets/og-recepcionista-telefonica-ia.jpg` },
  {
    ruta: '/como-automatizar-procesos-pyme-ia', archivo: 'como-automatizar-procesos-pyme-ia.html', nombre: 'Cómo automatizar procesos en una pyme con IA',
    tipo: 'articulo', publicado: '2026-10-08', padre: '/automatizacion-ia', sobre: '/automatizacion-ia', prioridad: '0.7', cambia: 'monthly',
    imagen: `${DOMINIO}/assets/og-como-automatizar-procesos-pyme-ia.jpg`,
    resumen: 'Guía práctica: qué procesos automatizar primero, cómo hacerlo en 5 pasos, cómo calcular si compensa y qué exige la ley (RGPD y normativa europea de IA).',
  },
  { ruta: '/asistente-whatsapp-ia', archivo: 'asistente-whatsapp-ia.html', nombre: 'Asistente de WhatsApp con IA', prioridad: '0.8', cambia: 'monthly', servicio: 'asistente-whatsapp-ia', padre: '/automatizacion-ia', imagen: `${DOMINIO}/assets/og-asistente-whatsapp-ia.jpg` },
];

const proceso = [
  ['Diagnóstico', 'Analizamos el negocio, la web actual y dónde se pierden clientes o tiempo cada semana.'],
  ['Propuesta', 'Una solución concreta, con alcance y precio cerrado desde el primer momento.'],
  ['Diseño y desarrollo', 'Creamos la web y las automatizaciones, con revisiones con el cliente en cada fase.'],
  ['Lanzamiento', 'Publicamos, probamos todo a fondo y comprobamos que cada detalle funciona.'],
  ['Acompañamiento', 'Seguimos al lado del cliente con soporte, mejoras y ajustes a medida que el negocio crece.'],
];

const porQue = [
  'El trabajo se mide en dinero para el cliente: en un caso real (una clínica con tres automatizaciones de Anomalia) el retorno estimado es de unos 20.000 € el primer año y cerca de 70.000 € en tres años, entre ahorro en personal y citas que ya no se pierden.',
  'Diseño y automatización en el mismo equipo: la web y los procesos que la rodean (citas, recordatorios, seguimiento) se construyen juntos.',
  'Plazos cortos: la mayoría de proyectos están listos en una semana o menos.',
  'Precio cerrado en la propuesta, sin sorpresas; la auditoría tiene precio público (550 €, o 450 € si luego se contrata un servicio).',
  'Cada web sale legal (RGPD/LSSI), segura y con SEO técnico incluido, no como extra.',
  'El dominio, la web y los accesos son siempre del cliente.',
  'Trato directo con quien construye el proyecto, no con un departamento de atención al cliente. Respuesta en menos de 24 h laborables.',
  'Primera cita gratuita y reservable al momento desde la web, mediante un asistente con IA que agenda directamente en la agenda del estudio.',
];

// Caso real con cifras. Son ESTIMACIONES hechas con los números del cliente, no
// resultados ya cerrados: así se redacta en toda la web, en llms.txt y en about.md.
const caso = {
  cliente: 'una clínica',
  sistemas: ['App de citas para clases de pilates', 'Asistente de WhatsApp con IA', 'Recepcionista telefónica con IA'],
  primerAnio: 20000,
  tresAnios: 70000,
  origen: [
    'Ahorro en personal: el teléfono, el WhatsApp y la agenda los atienden los agentes de IA las 24 horas, trabajo de recepción que la clínica ya no tiene que cubrir con plantilla.',
    'Citas que ya no se pierden: las llamadas y mensajes que antes quedaban sin contestar, y acababan en la clínica de al lado, ahora se atienden y se convierten en cita al momento.',
  ],
  nota: 'Cifras estimadas con los datos de la propia clínica. En la primera cita se hace la misma cuenta con los datos de cada negocio.',
};

// Perfiles oficiales en redes. Se pintan en el pie de todas las páginas y van al
// sameAs del JSON-LD. red: linkedin | instagram | facebook | x | tiktok | youtube | web
// persona: true  -> es un perfil del fundador, no de la empresa (va al sameAs de la Persona).
// pie: false     -> existe y cuenta para Google, pero no se enseña en el pie (X: sin público objetivo).
// Pendiente: la página de empresa de LinkedIn, cuando exista.
const redes = [
  { red: 'linkedin', nombre: 'LinkedIn', etiqueta: 'Marcos Mompeán, fundador de Anomalia, en LinkedIn', persona: true, url: 'https://www.linkedin.com/in/marcos-mompean-lopez-b9a086436/' },
  { red: 'instagram', nombre: 'Instagram', url: 'https://www.instagram.com/anomalia.business/' },
  { red: 'tiktok', nombre: 'TikTok', url: 'https://www.tiktok.com/@anomalia.business' },
  { red: 'youtube', nombre: 'YouTube', url: 'https://www.youtube.com/@anomaliabusiness' },
  { red: 'x', nombre: 'X', url: 'https://x.com/EstudioAnomalia', pie: false },
  { red: 'facebook', nombre: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61594508481121' },
];

// Clave de IndexNow: avisa a Bing (y por tanto a ChatGPT y Copilot) de cada URL nueva.
// El generador publica <clave>.txt en la raíz; scripts/indexnow.js hace el aviso.
const indexNow = '813fcf571180190a10725e243085f916';

// Bots de buscadores y de IA a los que se les abre la puerta explícitamente.
const botsIA = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Googlebot', 'Bingbot',
  'Applebot', 'Applebot-Extended', 'DuckAssistBot', 'YouBot', 'MistralAI-User', 'Meta-ExternalAgent',
];

module.exports = { DOMINIO, org, servicios, paginas, proceso, porQue, caso, redes, indexNow, botsIA };
