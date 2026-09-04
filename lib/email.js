// Envío de emails con Resend (fetch nativo, sin dependencias).
async function enviar({ para, asunto, html, texto }) {
  if (process.env.MODO_PRUEBA === 'si') {
    console.log(`[email:prueba] para=${para} asunto="${asunto}"`);
    return { enviado: true, id: 'prueba' };
  }
  const clave = process.env.RESEND_API_KEY;
  const remitente = process.env.EMAIL_REMITENTE;
  if (!clave || !remitente) {
    console.warn('[email] Falta RESEND_API_KEY o EMAIL_REMITENTE: no se envía el correo.');
    return { enviado: false, motivo: 'sin configurar' };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${clave}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: remitente,
      to: Array.isArray(para) ? para : [para],
      subject: asunto,
      html: html || undefined,
      text: texto || undefined,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return { enviado: true, id: j.id };
}

function plantillaConfirmacion(negocio, { lead, servicio, etiqueta }) {
  const tel = negocio.telefonoContacto || '';
  const saludo = lead && lead.nombre ? `Hola ${escapar(lead.nombre)}` : 'Hola';
  const lineaTel = tel ? `<p style="color:#666;font-size:13px">Si surge cualquier inconveniente, puedes llamarnos al ${escapar(tel)}.</p>` : '';
  const lineaTelTexto = tel ? ` Si surge cualquier inconveniente, puedes llamarnos al ${tel}.` : '';
  return {
    asunto: `Cita confirmada - ${negocio.nombre}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
      <h2 style="color:${(negocio.widget && negocio.widget.color) || '#2563eb'}">Tu cita está confirmada</h2>
      <p>${saludo}, gracias por confiar en ${escapar(negocio.nombre)}.</p>
      <p><strong>${escapar(etiqueta)}</strong>${servicio ? ' - ' + escapar(servicio) : ''}</p>
      ${lineaTel}
    </div>`,
    texto: `${saludo}, gracias por confiar en ${negocio.nombre}. Tu cita queda confirmada: ${etiqueta}${servicio ? ' - ' + servicio : ''}.${lineaTelTexto}`,
  };
}

// tipo: '24h' | '2h' -- cambia solo el tono ("mañana" vs "en dos horas").
function plantillaRecordatorio(negocio, { nombre, etiqueta, tipo }) {
  const esProxima = tipo === '2h';
  const tel = negocio.telefonoContacto || '';
  const saludo = nombre ? `Hola ${escapar(nombre)}` : 'Hola';
  const linea = esProxima ? 'tu cita empieza dentro de unas 2 horas:' : 'te recordamos tu cita de mañana:';
  const lineaTel = tel ? `<p style="color:#666;font-size:13px">Si necesitas cambiarla, llámanos al ${escapar(tel)}.</p>` : '';
  const lineaTelTexto = tel ? ` Si necesitas cambiarla, llámanos al ${tel}.` : '';
  return {
    asunto: esProxima ? `Tu cita empieza en 2 horas - ${negocio.nombre}` : `Recordatorio: tu cita es mañana - ${negocio.nombre}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
      <h2 style="color:${(negocio.widget && negocio.widget.color) || '#2563eb'}">${esProxima ? 'Nos vemos en un rato' : 'Te esperamos mañana'}</h2>
      <p>${saludo}, ${linea}</p>
      <p><strong>${escapar(etiqueta)}</strong></p>
      ${lineaTel}
    </div>`,
    texto: `${saludo}, ${linea} ${etiqueta}.${lineaTelTexto}`,
  };
}

function plantillaAvisoInterno(negocio, { lead, servicio, etiqueta }) {
  const filas = (negocio.camposLead || []).map((c) => `${c.etiqueta}: ${lead[c.id] || '-'}`).join('\n');
  return {
    asunto: `Lead nuevo con cita - ${lead.nombre || 'sin nombre'}`,
    texto: `Nuevo lead con cita agendada.\n\n${filas}\nServicio: ${servicio || '-'}\nCuándo: ${etiqueta}`,
  };
}

function escapar(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

module.exports = { enviar, plantillaConfirmacion, plantillaRecordatorio, plantillaAvisoInterno };
