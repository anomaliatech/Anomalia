#!/usr/bin/env node
// Genera TODO el SEO/GEO del sitio a partir de lib/sitio.js y del contenido real
// de cada HTML (título, descripción, FAQ y texto). Se ejecuta antes de publicar:
//
//     node scripts/generar-seo.js          # escribe los ficheros
//     node scripts/generar-seo.js --check  # sale con 1 si algo está desactualizado
//
// Produce / actualiza:
//   - el bloque JSON-LD (@graph) de cada página, entre <!-- seo:jsonld --> y <!-- /seo:jsonld -->
//   - el sello ?v=<hash> en los <link>/<script> locales (caché inmutable sin servir CSS viejo)
//   - sitemap.xml, robots.txt, llms.txt, llms-full.txt, about.md
//
// Es un "SSG" de metadatos: el HTML sigue siendo estático (TTFB de CDN), pero los
// datos estructurados salen de una sola fuente y nunca se desincronizan del contenido.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const sitio = require('../lib/sitio');

const RAIZ = path.join(__dirname, '..');
const SOLO_COMPROBAR = process.argv.includes('--check');
const D = sitio.DOMINIO;
let desactualizados = 0;

// ---------------------------------------------------------------- utilidades
function leer(f) { return fs.readFileSync(path.join(RAIZ, f), 'utf8'); }
function escribir(f, contenido) {
  const ruta = path.join(RAIZ, f);
  const actual = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : null;
  if (actual === contenido) return false;
  desactualizados++;
  if (!SOLO_COMPROBAR) fs.writeFileSync(ruta, contenido);
  console.log(`${SOLO_COMPROBAR ? 'DESACTUALIZADO' : 'escrito'}  ${f}`);
  return true;
}
function hash8(f) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(RAIZ, f))).digest('hex').slice(0, 8); }

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»', copy: '©', euro: '€' };
function decodificar(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTIDADES[n.toLowerCase()] != null ? ENTIDADES[n.toLowerCase()] : m));
}
function texto(html) {
  return decodificar(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Fecha de última modificación real: la del último commit que tocó el fichero; si
// tiene cambios sin commitear, hoy.
function lastmod(f) {
  try {
    const sucio = execSync(`git status --porcelain -- "${f}"`, { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (sucio) return new Date().toISOString().slice(0, 10);
    const iso = execSync(`git log -1 --format=%cI -- "${f}"`, { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (iso) return iso.slice(0, 10);
  } catch { /* sin git */ }
  return new Date(fs.statSync(path.join(RAIZ, f)).mtime).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- lectura HTML
function extraer(html) {
  const title = texto((html.match(/<title>([\s\S]*?)<\/title>/i) || [, ''])[1]);
  const descripcion = decodificar((html.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || [, ''])[1]);
  const h1 = texto((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [, ''])[1].replace(/<br\s*\/?>/gi, ' '));
  const faq = [];
  const re = /<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="a">([\s\S]*?)<\/div>\s*<\/details>/gi;
  let m;
  while ((m = re.exec(html))) faq.push({ pregunta: texto(m[1]), respuesta: texto(m[2]) });
  const main = (html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) || [, ''])[1];
  return { title, descripcion, h1, faq, main };
}

// HTML -> texto plano estructurado (markdown ligero) para llms-full.txt.
function aMarkdown(html) {
  let s = html
    .replace(/<(script|style|svg|template|form|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+aria-hidden="true"[^>]*>[\s\S]*?<\/(?:div|span)>/gi, ' ') // decoración
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `\n\n# ${texto(t)}\n\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n\n## ${texto(t)}\n\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n\n### ${texto(t)}\n\n`)
    .replace(/<summary[^>]*>([\s\S]*?)<\/summary>/gi, (_, t) => `\n\n**${texto(t)}**\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${texto(t)}`)
    .replace(/<\/(p|div|details|article|section|ul|ol|blockquote|figure|figcaption)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodificar(s)
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
}

// ---------------------------------------------------------------- JSON-LD
const o = sitio.org;
function nodoOrganizacion(completo) {
  const n = {
    '@type': o.tipoNegocio,
    '@id': o.id,
    name: o.nombre,
    url: o.url,
    logo: { '@type': 'ImageObject', url: o.logo, width: 512, height: 512 },
    image: o.imagen,
    email: o.email,
    telephone: o.telefono,
  };
  if (!completo) return n;
  return Object.assign(n, {
    alternateName: o.alias,
    description: o.descripcion,
    slogan: o.eslogan,
    founder: { '@type': 'Person', name: o.fundador },
    areaServed: { '@type': 'Country', name: 'España', identifier: o.pais },
    knowsLanguage: [o.idioma],
    knowsAbout: o.categorias,
    priceRange: '€€',
    openingHours: 'Mo-Su 12:00-21:00',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email: o.email,
      telephone: o.telefono,
      availableLanguage: ['es'],
      areaServed: o.pais,
    },
    ...(o.sameAs.length ? { sameAs: o.sameAs } : {}),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Servicios de Anomalia',
      itemListElement: sitio.servicios.map((s) => ({
        '@type': 'Offer',
        url: D + s.ruta,
        itemOffered: { '@id': `${D}${s.ruta}#service` },
        ...(s.precio ? { priceCurrency: s.precio.moneda, price: String(Math.min(...s.precio.ofertas.map((x) => x.precio))) } : {}),
      })),
    },
  });
}

function nodoServicio(s, completo) {
  const n = {
    '@type': 'Service',
    '@id': `${D}${s.ruta}#service`,
    name: s.nombre,
    serviceType: s.tipo,
    url: D + s.ruta,
    provider: { '@id': o.id },
  };
  if (!completo) return Object.assign(n, { description: s.resumen });
  return Object.assign(n, {
    description: s.descripcion,
    areaServed: { '@type': 'Country', name: 'España', identifier: o.pais },
    audience: { '@type': 'BusinessAudience', audienceType: 'Pymes, autónomos y negocios locales' },
    availableChannel: { '@type': 'ServiceChannel', serviceUrl: `${D}/#contacto`, availableLanguage: 'es' },
    ...(s.precio
      ? {
          offers: s.precio.ofertas.map((of) => ({
            '@type': 'Offer',
            name: of.nombre,
            description: of.nota,
            price: String(of.precio),
            priceCurrency: s.precio.moneda,
            availability: 'https://schema.org/InStock',
            url: D + s.ruta,
            seller: { '@id': o.id },
          })),
        }
      : {}),
  });
}

function nodoFaq(url, faq) {
  if (!faq.length) return null;
  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.pregunta,
      acceptedAnswer: { '@type': 'Answer', text: f.respuesta },
    })),
  };
}

function grafo(pag, info, fecha) {
  const url = D + pag.ruta;
  const servicio = pag.servicio ? sitio.servicios.find((s) => s.id === pag.servicio) : null;
  const nodos = [];
  if (!pag.servicio) {
    nodos.push(nodoOrganizacion(true));
    nodos.push({ '@type': 'WebSite', '@id': `${D}/#website`, url: o.url, name: o.nombre, publisher: { '@id': o.id }, inLanguage: 'es' });
    for (const s of sitio.servicios) nodos.push(nodoServicio(s, false));
  } else {
    nodos.push(nodoOrganizacion(false));
    nodos.push(nodoServicio(servicio, true));
    nodos.push({
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: o.url },
        { '@type': 'ListItem', position: 2, name: pag.nombre, item: url },
      ],
    });
  }
  nodos.push({
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: info.title,
    description: info.descripcion,
    inLanguage: 'es',
    dateModified: fecha,
    isPartOf: { '@id': `${D}/#website` },
    about: { '@id': pag.servicio ? `${url}#service` : o.id },
    primaryImageOfPage: { '@type': 'ImageObject', url: pag.imagen || o.imagen, width: 1200, height: 630 },
    ...(pag.servicio ? { breadcrumb: { '@id': `${url}#breadcrumb` } } : {}),
  });
  const faq = nodoFaq(url, info.faq);
  if (faq) nodos.push(faq);
  return { '@context': 'https://schema.org', '@graph': nodos };
}

// ---------------------------------------------------------------- inyección en HTML
function inyectarJsonLd(html, grafoJson) {
  const bloque = `<!-- seo:jsonld -->\n<script type="application/ld+json">\n${JSON.stringify(grafoJson)}\n</script>\n<!-- /seo:jsonld -->`;
  if (/<!-- seo:jsonld -->[\s\S]*?<!-- \/seo:jsonld -->/.test(html)) {
    return html.replace(/<!-- seo:jsonld -->[\s\S]*?<!-- \/seo:jsonld -->/, bloque);
  }
  // Primera vez: quita los ld+json sueltos del <head> y pone el bloque en su lugar.
  const head = html.match(/<head>[\s\S]*?<\/head>/i)[0];
  let nuevo = head.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, '');
  nuevo = nuevo.replace(/(\n<link rel="icon")/, `\n${bloque}$1`);
  if (nuevo === head.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, '')) {
    nuevo = nuevo.replace(/<\/head>/i, `${bloque}\n</head>`);
  }
  return html.replace(head, nuevo);
}

// motion.css -> motion.css?v=1a2b3c4d (hash del contenido). El fichero puede
// cachearse 1 año como inmutable: si cambia, cambia la URL.
function sellarRecursos(html) {
  return html.replace(/(href|src)="(\/?)([a-z0-9-]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"/gi, (m, attr, barra, fich) => {
    if (!fs.existsSync(path.join(RAIZ, fich))) return m;
    return `${attr}="${barra}${fich}?v=${hash8(fich)}"`;
  });
}

// ---------------------------------------------------------------- ficheros GEO
function llmsTxt(infos) {
  const L = [];
  L.push(`# ${o.nombre}`);
  L.push('');
  L.push(`> ${o.descripcion}`);
  L.push('');
  L.push(`${o.nombre} (también escrito "${o.alias[0]}") es un estudio digital con sede en España fundado por ${o.fundador}. Trabaja en remoto con negocios de toda España, sobre todo ${o.sectores.map((s) => s.toLowerCase()).join(', ')}. Idioma de trabajo: español. Horario de atención: ${o.horario}.`);
  L.push('');
  L.push('## Servicios');
  L.push('');
  for (const s of sitio.servicios) {
    const precio = s.precio
      ? ` Precio: ${s.precio.ofertas.map((x) => `${x.precio} € (${x.nombre.toLowerCase()})`).join(' / ')}.`
      : ' Precio: a presupuesto cerrado tras una primera reunión gratuita; no se publica tarifa.';
    L.push(`- [${s.nombre}](${D}${s.ruta}): ${s.resumen}${precio}`);
  }
  L.push('');
  L.push('## Por qué elegir Anomalia');
  L.push('');
  for (const p of sitio.porQue) L.push(`- ${p}`);
  L.push('');
  L.push('## Cómo trabaja');
  L.push('');
  sitio.proceso.forEach(([t, d], i) => L.push(`${i + 1}. **${t}.** ${d}`));
  L.push('');
  L.push('## Preguntas frecuentes');
  L.push('');
  const vistas = new Set();
  for (const info of infos) for (const f of info.faq) {
    if (vistas.has(f.pregunta)) continue;
    vistas.add(f.pregunta);
    L.push(`- **${f.pregunta}** ${f.respuesta}`);
  }
  L.push('');
  L.push('## Contacto');
  L.push('');
  L.push(`- Web: ${o.url}`);
  L.push(`- Reservar una primera cita gratuita (asistente con IA, 24/7): ${D}/#contacto`);
  L.push(`- Email: ${o.email}`);
  L.push(`- Teléfono: ${o.telefonoHumano}`);
  L.push('');
  L.push('## Optional');
  L.push('');
  L.push(`- [Sobre Anomalia (about.md)](${D}/about.md): ficha completa de la entidad, servicios, precios y proceso.`);
  L.push(`- [Contenido completo del sitio (llms-full.txt)](${D}/llms-full.txt): el texto íntegro de todas las páginas.`);
  L.push(`- [Sitemap](${D}/sitemap.xml)`);
  return L.join('\n') + '\n';
}

function llmsFullTxt(infos) {
  const partes = [`# ${o.nombre} — contenido completo del sitio`, '', `> ${o.descripcion}`, ''];
  for (const { pag, info } of infos) {
    partes.push('---', '', `# Página: ${info.title}`, `URL: ${D}${pag.ruta}`, `Descripción: ${info.descripcion}`, '');
    partes.push(aMarkdown(info.main || ''));
    partes.push('');
  }
  return partes.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

function aboutMd(infos) {
  const L = [];
  L.push(`# Sobre ${o.nombre}`);
  L.push('');
  L.push(o.descripcion);
  L.push('');
  L.push('## Ficha de la entidad');
  L.push('');
  L.push(`- **Nombre:** ${o.nombre} (${o.alias.join(', ')})`);
  L.push(`- **Tipo:** estudio digital (diseño web, automatización e inteligencia artificial para negocios)`);
  L.push(`- **Fundador:** ${o.fundador}`);
  L.push(`- **Sede:** España · trabajo 100 % en remoto con clientes de todo el país`);
  L.push(`- **Idioma:** español`);
  L.push(`- **Web:** ${o.url}`);
  L.push(`- **Email:** ${o.email}`);
  L.push(`- **Teléfono:** ${o.telefonoHumano}`);
  L.push(`- **Horario:** ${o.horario}`);
  L.push(`- **Sectores habituales:** ${o.sectores.join(', ')}`);
  L.push('');
  L.push('## Qué hace');
  L.push('');
  for (const s of sitio.servicios) {
    L.push(`### ${s.nombre}`);
    L.push('');
    L.push(s.descripcion);
    L.push('');
    L.push(`- Plazo: ${s.plazo}`);
    if (s.precio) for (const x of s.precio.ofertas) L.push(`- Precio: **${x.precio} €** — ${x.nombre}. ${x.nota}`);
    else L.push('- Precio: a presupuesto cerrado tras una primera reunión gratuita (no se publica tarifa, depende del alcance).');
    L.push(`- Más información: ${D}${s.ruta}`);
    L.push('');
  }
  L.push('## Cómo trabaja (proceso en 5 pasos)');
  L.push('');
  sitio.proceso.forEach(([t, d], i) => L.push(`${i + 1}. **${t}.** ${d}`));
  L.push('');
  L.push('## Por qué Anomalia');
  L.push('');
  for (const p of sitio.porQue) L.push(`- ${p}`);
  L.push('');
  L.push('## Preguntas frecuentes');
  L.push('');
  const vistas = new Set();
  for (const { info } of infos) for (const f of info.faq) {
    if (vistas.has(f.pregunta)) continue;
    vistas.add(f.pregunta);
    L.push(`**${f.pregunta}**`);
    L.push('');
    L.push(f.respuesta);
    L.push('');
  }
  L.push('## Cómo citar esta fuente');
  L.push('');
  L.push(`${o.nombre} — estudio digital de diseño web, automatización e IA para negocios en España. ${o.url}`);
  return L.join('\n') + '\n';
}

function robotsTxt() {
  const L = ['# robots.txt de ' + o.url, '', 'User-agent: *', 'Allow: /', 'Disallow: /api/', ''];
  L.push('# Buscadores y asistentes de IA: acceso explícito al contenido público.');
  for (const b of sitio.botsIA) L.push(`User-agent: ${b}`);
  L.push('Allow: /', 'Disallow: /api/', '');
  L.push(`Sitemap: ${D}/sitemap.xml`);
  L.push('');
  L.push(`# Resumen legible por modelos de lenguaje: ${D}/llms.txt`);
  return L.join('\n') + '\n';
}

function sitemapXml(infos) {
  const urls = infos.map(({ pag }) => [
    '  <url>',
    `    <loc>${D}${pag.ruta}</loc>`,
    `    <lastmod>${pag.fecha}</lastmod>`,
    `    <changefreq>${pag.cambia}</changefreq>`,
    `    <priority>${pag.prioridad}</priority>`,
    '  </url>',
  ].join('\n'));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

// ---------------------------------------------------------------- ejecución
const infos = [];
for (const pag of sitio.paginas) {
  const original = leer(pag.archivo);
  const info = extraer(original);
  if (!info.title || !info.descripcion) throw new Error(`${pag.archivo}: falta <title> o meta description`);
  if (!info.main) console.warn(`AVISO ${pag.archivo}: no tiene <main>; llms-full.txt saldrá sin su contenido`);
  infos.push({ pag, info });
  // Fecha de modificación: la del último commit; pero si esta misma pasada va a
  // cambiar el fichero, la fecha real es hoy (y así la segunda pasada no cambia nada).
  const construir = (fecha) => sellarRecursos(inyectarJsonLd(original, grafo(pag, info, fecha)));
  pag.fecha = lastmod(pag.archivo);
  let html = construir(pag.fecha);
  if (html !== original) { pag.fecha = new Date().toISOString().slice(0, 10); html = construir(pag.fecha); }
  escribir(pag.archivo, html);
}
// Páginas fuera del sitemap que también cargan CSS/JS cacheados como inmutables.
for (const extra of ['404.html']) {
  if (fs.existsSync(path.join(RAIZ, extra))) escribir(extra, sellarRecursos(leer(extra)));
}
escribir('sitemap.xml', sitemapXml(infos));
escribir('robots.txt', robotsTxt());
escribir('llms.txt', llmsTxt(infos.map((x) => x.info)));
escribir('llms-full.txt', llmsFullTxt(infos));
escribir('about.md', aboutMd(infos));

if (SOLO_COMPROBAR) {
  if (desactualizados) { console.error(`\n${desactualizados} fichero(s) desactualizado(s). Ejecuta: node scripts/generar-seo.js`); process.exit(1); }
  console.log('SEO al día.');
} else {
  console.log(desactualizados ? `\n${desactualizados} fichero(s) actualizado(s).` : 'Nada que cambiar: todo estaba al día.');
}
