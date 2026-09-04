// Google Calendar mediante cuenta de servicio.
// Firma un JWT RS256 con crypto nativo -> pide token -> llama a Calendar API v3.
// Sin la librería googleapis: más ligero y más portable.
const crypto = require('crypto');

const SCOPE = 'https://www.googleapis.com/auth/calendar';
const TAG = 'agenteCitas'; // marca los eventos creados por el agente

// El calendario: la variable de entorno manda sobre negocio.json (útil al desplegar).
function calId(negocio) {
  return process.env.GOOGLE_CALENDAR_ID || negocio.calendarioId;
}

let tokenCache = { valor: null, expira: 0 };

function credenciales() {
  const bruto = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!bruto) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON.');
  let j;
  try { j = JSON.parse(bruto); } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido.'); }
  if (!j.client_email || !j.private_key) throw new Error('El JSON de la cuenta de servicio no tiene client_email / private_key.');
  return j;
}

function b64url(x) {
  return Buffer.from(x).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function token() {
  if (tokenCache.valor && Date.now() < tokenCache.expira - 60000) return tokenCache.valor;
  const cred = credenciales();
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = b64url(JSON.stringify({
    iss: cred.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahora,
    exp: ahora + 3600,
  }));
  const firma = crypto
    .sign('RSA-SHA256', Buffer.from(`${cabecera}.${cuerpo}`), cred.private_key)
    .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${cabecera}.${cuerpo}.${firma}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`No se pudo obtener token de Google: ${r.status} ${JSON.stringify(j)}`);
  tokenCache = { valor: j.access_token, expira: Date.now() + j.expires_in * 1000 };
  return tokenCache.valor;
}

async function api(ruta, opciones = {}) {
  const t = await token();
  const r = await fetch(`https://www.googleapis.com/calendar/v3${ruta}`, {
    ...opciones,
    headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', ...(opciones.headers || {}) },
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`Google Calendar ${r.status}: ${texto.slice(0, 500)}`);
  return texto ? JSON.parse(texto) : {};
}

// --- zonas horarias, sin librería --------------------------------------
function offsetMs(fecha, zona) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(fecha).reduce((a, x) => ((a[x.type] = x.value), a), {});
  const comoUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return comoUTC - fecha.getTime();
}
function horaLocalAInstante(y, mo, d, h, mi, zona) {
  let ts = Date.UTC(y, mo - 1, d, h, mi, 0);
  for (let i = 0; i < 2; i++) ts = Date.UTC(y, mo - 1, d, h, mi, 0) - offsetMs(new Date(ts), zona);
  return new Date(ts);
}
function isoConZona(fecha, zona) {
  const off = offsetMs(fecha, zona);
  const signo = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 3600000)).padStart(2, '0');
  const mm = String(Math.floor((abs % 3600000) / 60000)).padStart(2, '0');
  const local = new Date(fecha.getTime() + off);
  return local.toISOString().slice(0, 19) + signo + hh + ':' + mm;
}

const DIA_EN = { Sun: 'dom', Mon: 'lun', Tue: 'mar', Wed: 'mie', Thu: 'jue', Fri: 'vie', Sat: 'sab' };

// Devuelve una lista de inicios de cita libres (objetos Date), respetando horario y ocupación.
async function huecosLibres(negocio, { duracionMin, desde } = {}) {
  const zona = negocio.zonaHoraria;
  if (process.env.MODO_PRUEBA === 'si') {
    const base = new Date(Date.now() + 2 * 86400000);
    base.setUTCHours(8, 0, 0, 0);
    return [0, 1, 2].map((i) => {
      const f = new Date(base.getTime() + i * 3600000);
      return { inicio: f.toISOString(), iso: isoConZona(f, zona), etiqueta: etiquetaHumana(f, zona, negocio.idioma || 'es') };
    });
  }
  const dur = duracionMin || negocio.duracionCitaPorDefectoMin || 30;
  const antelacion = (negocio.antelacionMinimaHoras || 0) * 3600000;
  const inicioVentana = new Date((desde ? new Date(desde) : new Date()).getTime() + antelacion);
  const finVentana = new Date(inicioVentana.getTime() + (negocio.diasVistaPrevia || 10) * 86400000);

  const fb = await api('/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: inicioVentana.toISOString(),
      timeMax: finVentana.toISOString(),
      items: [{ id: calId(negocio) }],
    }),
  });
  const calInfo = fb.calendars?.[calId(negocio)] || {};
  if (calInfo.errors && calInfo.errors.length) {
    throw new Error(
      `No se puede acceder al calendario "${calId(negocio)}" (${calInfo.errors.map((e) => e.reason).join(', ')}). ` +
      `Comparte ese calendario con la cuenta de servicio dándole "Realizar cambios en los eventos", ` +
      `o revisa GOOGLE_CALENDAR_ID.`
    );
  }
  const ocupado = (calInfo.busy || [])
    .map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()]);

  const libres = [];
  for (let d = 0; d < (negocio.diasVistaPrevia || 10) && libres.length < 12; d++) {
    const dia = new Date(inicioVentana.getTime() + d * 86400000);
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
      .formatToParts(dia).reduce((a, x) => ((a[x.type] = x.value), a), {});
    const nombreDia = DIA_EN[p.weekday];
    const rangos = negocio.horarioAtencion[nombreDia] || [];
    for (const [ini, fin] of rangos) {
      const [hi, mi] = ini.split(':').map(Number);
      const [hf, mf] = fin.split(':').map(Number);
      let t = horaLocalAInstante(+p.year, +p.month, +p.day, hi, mi, zona);
      const cierre = horaLocalAInstante(+p.year, +p.month, +p.day, hf, mf, zona);
      while (t.getTime() + dur * 60000 <= cierre.getTime() && libres.length < 12) {
        const ini2 = t.getTime();
        const fin2 = ini2 + dur * 60000;
        const chocaOcupado = ocupado.some(([bi, bf]) => ini2 < bf && fin2 > bi);
        if (ini2 >= inicioVentana.getTime() && !chocaOcupado) libres.push(new Date(ini2));
        t = new Date(ini2 + dur * 60000);
      }
    }
  }
  return libres.map((f) => ({ inicio: f.toISOString(), iso: isoConZona(f, zona), etiqueta: etiquetaHumana(f, zona, negocio.idioma || 'es') }));
}

function etiquetaHumana(fecha, zona, idioma) {
  return new Intl.DateTimeFormat(idioma === 'es' ? 'es-ES' : idioma, {
    timeZone: zona, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(fecha);
}

async function crearCita(negocio, { inicioISO, duracionMin, servicio, lead }) {
  const zona = negocio.zonaHoraria;
  const dur = duracionMin || negocio.duracionCitaPorDefectoMin || 30;
  const ini = new Date(inicioISO);
  const fin = new Date(ini.getTime() + dur * 60000);
  if (process.env.MODO_PRUEBA === 'si') {
    return { id: 'evt_prueba_' + Date.now(), htmlLink: 'https://calendar.google.com/prueba', inicio: isoConZona(ini, zona), etiqueta: etiquetaHumana(ini, zona, negocio.idioma || 'es') };
  }
  const descripcion = [
    `Cita solicitada por el asistente de la web.`,
    ``,
    ...(negocio.camposLead || []).map((c) => `${c.etiqueta}: ${lead[c.id] || '(sin dato)'}`),
    servicio ? `Servicio: ${servicio}` : '',
  ].filter(Boolean).join('\n');

  const evento = await api(`/calendars/${encodeURIComponent(calId(negocio))}/events`, {
    method: 'POST',
    body: JSON.stringify({
      // El telefono va en el titulo: es la via de contacto y asi se ve desde la
      // rejilla del calendario, sin abrir el evento.
      summary: `Cita: ${lead.nombre || 'Lead web'}${lead.telefono ? ' (' + lead.telefono + ')' : ''}${servicio ? ' - ' + servicio : ''}`,
      description: descripcion,
      start: { dateTime: isoConZona(ini, zona), timeZone: zona },
      end: { dateTime: isoConZona(fin, zona), timeZone: zona },
      extendedProperties: {
        private: { [TAG]: 'si', recordatorioEnviado: 'no', leadEmail: lead.email || '', leadTelefono: lead.telefono || '', leadNombre: lead.nombre || '' },
      },
    }),
  });
  return { id: evento.id, htmlLink: evento.htmlLink, inicio: isoConZona(ini, zona), etiqueta: etiquetaHumana(ini, zona, negocio.idioma || 'es') };
}

async function borrarCita(negocio, eventoId) {
  await api(`/calendars/${encodeURIComponent(calId(negocio))}/events/${eventoId}`, { method: 'DELETE' });
}

// Citas del agente en una ventana, para recordatorios.
async function citasEntre(negocio, timeMin, timeMax) {
  if (process.env.MODO_PRUEBA === 'si') return [];
  const q = new URLSearchParams({
    timeMin: new Date(timeMin).toISOString(),
    timeMax: new Date(timeMax).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    privateExtendedProperty: `${TAG}=si`,
  });
  const j = await api(`/calendars/${encodeURIComponent(calId(negocio))}/events?${q}`);
  return j.items || [];
}

async function marcarRecordado(negocio, eventoId) {
  await api(`/calendars/${encodeURIComponent(calId(negocio))}/events/${eventoId}`, {
    method: 'PATCH',
    body: JSON.stringify({ extendedProperties: { private: { recordatorioEnviado: 'si' } } }),
  });
}

module.exports = { huecosLibres, crearCita, borrarCita, citasEntre, marcarRecordado, isoConZona, etiquetaHumana, token };
