// Límite de peticiones: por IP (ventana fija) y tope global diario (cortafuegos de
// coste: un bot no puede quemar el presupuesto de IA en una noche). INCR + EXPIRE en
// Upstash si existe; si no, contador en memoria de la instancia (vale para frenar
// a un cliente que machaca la misma instancia, no es global). Un WAF sigue siendo
// la primera línea; esto es la segunda, dentro de la app.
const { comando } = require('./cache');

// Se pueden ajustar por entorno sin tocar código: LIMITE_CHAT_IP=60, LIMITE_CHAT_DIA=5000...
const BASE = {
  chat:           { porIp: 40,  ventanaSeg: 600,  diario: 3000 },
  reservar:       { porIp: 6,   ventanaSeg: 3600, diario: 300 },
  disponibilidad: { porIp: 60,  ventanaSeg: 600,  diario: 5000 },
  config:         { porIp: 120, ventanaSeg: 600 },
  'lead-perdido': { porIp: 6,   ventanaSeg: 3600, diario: 300 },
};

function limites(ruta) {
  const b = BASE[ruta];
  if (!b) return null;
  const R = ruta.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return {
    porIp: Number(process.env[`LIMITE_${R}_IP`]) || b.porIp,
    ventanaSeg: b.ventanaSeg,
    diario: process.env[`LIMITE_${R}_DIA`] != null ? Number(process.env[`LIMITE_${R}_DIA`]) : b.diario,
  };
}

const mem = new Map();
function contarMem(clave, ventanaSeg) {
  const ahora = Date.now();
  if (mem.size > 5000) for (const [k, v] of mem) if (v.expira < ahora) mem.delete(k);
  const e = mem.get(clave);
  if (!e || e.expira < ahora) { mem.set(clave, { n: 1, expira: ahora + ventanaSeg * 1000 }); return 1; }
  return ++e.n;
}

async function comprobar(ruta, ip) {
  const l = limites(ruta);
  if (!l) return { ok: true };
  const seg = Math.floor(Date.now() / 1000);
  const ventana = Math.floor(seg / l.ventanaSeg);
  const kIp = `lim:${ruta}:${ip}:${ventana}`;
  const kDia = `lim:${ruta}:dia:${new Date().toISOString().slice(0, 10)}`;
  let nIp = null, nDia = null;
  try {
    const r = await comando([['INCR', kIp], ['EXPIRE', kIp, String(l.ventanaSeg)], ['INCR', kDia], ['EXPIRE', kDia, '90000']]);
    if (r) { nIp = Number(r[0].result); nDia = Number(r[2].result); }
  } catch { /* sin Redis: cae a memoria */ }
  if (nIp == null) { nIp = contarMem(kIp, l.ventanaSeg); nDia = contarMem(kDia, 86400); }

  if (nIp > l.porIp) return { ok: false, motivo: 'ip', reintentaSeg: l.ventanaSeg - (seg % l.ventanaSeg) };
  if (l.diario && nDia > l.diario) return { ok: false, motivo: 'global', reintentaSeg: 3600 };
  return { ok: true, restante: Math.max(0, l.porIp - nIp) };
}

module.exports = { comprobar, limites };
