#!/usr/bin/env node
// Avisa a Bing (y a los demás buscadores de IndexNow) de que las URL del sitemap
// han cambiado. Bing es el índice que usan ChatGPT y Copilot para buscar en la web,
// así que una página nueva aparece ahí en horas en vez de en semanas.
//
// Ejecutar DESPUÉS de publicar (git push y Vercel en verde):
//     node scripts/indexnow.js            # todas las URL del sitemap
//     node scripts/indexnow.js /ruta ...  # solo esas
const fs = require('fs');
const path = require('path');
const { DOMINIO, indexNow } = require('../lib/sitio');

async function main() {
  if (!indexNow) throw new Error('Falta la clave indexNow en lib/sitio.js');
  const host = new URL(DOMINIO).host;
  const keyLocation = `${DOMINIO}/${indexNow}.txt`;

  // 1. La clave tiene que estar ya publicada; si no, Bing rechaza el aviso.
  const r = await fetch(keyLocation, { cache: 'no-store' });
  const publicada = r.ok ? (await r.text()).trim() : '';
  if (publicada !== indexNow) {
    throw new Error(`La clave no está publicada todavía en ${keyLocation} (HTTP ${r.status}). Publica primero y vuelve a ejecutar.`);
  }

  // 2. URLs: las que se pasen por argumento o todas las del sitemap.
  const args = process.argv.slice(2);
  const urlList = args.length
    ? args.map((a) => (a.startsWith('http') ? a : DOMINIO + a))
    : [...fs.readFileSync(path.join(__dirname, '..', 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  // 3. Aviso.
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: indexNow, keyLocation, urlList }),
  });
  const explicacion = { 200: 'recibido', 202: 'recibido, pendiente de validar la clave', 400: 'petición mal formada', 403: 'clave no válida', 422: 'URL que no son de este dominio', 429: 'demasiados avisos seguidos' };
  console.log(`IndexNow: HTTP ${res.status} (${explicacion[res.status] || 'respuesta inesperada'}) · ${urlList.length} URL`);
  for (const u of urlList) console.log('  ' + u);
  if (res.status >= 300) process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
