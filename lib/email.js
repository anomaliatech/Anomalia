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
  const filas = (negocio.camposLead || [])
    .map((c) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${c.etiqueta}</td><td>${escapar(lead[c.id] || '-')}</td></tr>`)
    .join('');
  return {
    asunto: `Cita confirmada - ${negocio.nombre}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
      <h2 style="color:${(negocio.widget && negocio.widget.color) || '#2563eb'}">Tu cita está confirmada</h2>
      <p><strong>${escapar(etiqueta)}</strong>${servicio ? ' - ' + escapar(servicio) : ''}</p>
      <p style="color:#666">Datos recogidos:</p>
      <table style="font-size:14px">${filas}</table>
      <p style="color:#666;font-size:13px">${escapar(negocio.mensajeHumano || '')}</p>
    </div>`,
    texto: `Cita confirmada en ${negocio.nombre}: ${etiqueta}${servicio ? ' - ' + servicio : ''}.`,
  };
}

function plantillaRecordatorio(negocio, { nombre, etiqueta }) {
  return {
    asunto: `Recordatorio: tu cita mañana - ${negocio.nombre}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
      <h2 style="color:${(negocio.widget && negocio.widget.color) || '#2563eb'}">Te esperamos mañana</h2>
      <p>Hola${nombre ? ' ' + escapar(nombre) : ''}, te recordamos tu cita:</p>
      <p><strong>${escapar(etiqueta)}</strong></p>
      <p style="color:#666;font-size:13px">${escapar(negocio.mensajeHumano || '')}</p>
    </div>`,
    texto: `Recordatorio de tu cita en ${negocio.nombre}: ${etiqueta}.`,
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
