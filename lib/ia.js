// Capa de abstracción del proveedor de IA, con soporte de herramientas (tool calling).
// Cambiar de proveedor = cambiar IA_PROVEEDOR (y su clave). Nada más.
// Sin dependencias: todo por fetch nativo.
//
// responder({ system, messages, tools }) -> { text: string|null, toolCalls: [{id,name,args}] }
//   messages: [{ role:'user'|'assistant', content }] y turnos de herramienta:
//             { role:'assistant', toolCalls:[...] } y { role:'tool', toolCallId, name, content }

// Se leen en cada llamada (no al cargar el módulo): así respetan el .env.local
// aunque este archivo se requiera antes de que el servidor lo cargue.
function proveedorActual() {
  return (process.env.IA_PROVEEDOR || 'gemini').toLowerCase();
}
function modeloActual() {
  return process.env.IA_MODELO || modeloPorDefecto(proveedorActual());
}

function modeloPorDefecto(p) {
  return {
    gemini: 'gemini-flash-latest',
    anthropic: 'claude-haiku-4-5',
    openai: 'gpt-4o-mini',
    groq: 'openai/gpt-oss-20b',
  }[p] || 'gemini-flash-latest';
}

const BASE_COMPATIBLE = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
};

async function pedir(url, opciones, reintentos = 1) {
  const r = await fetch(url, opciones);
  const texto = await r.text();
  if (!r.ok) {
    // 429 (límite) y 5xx: un reintento con espera corta.
    if ((r.status === 429 || r.status >= 500) && reintentos > 0) {
      const espera = Number((texto.match(/try again in ([\d.]+)s/i) || [])[1]) * 1000 || 2500;
      await new Promise((res) => setTimeout(res, Math.min(espera, 8000)));
      return pedir(url, opciones, reintentos - 1);
    }
    const err = new Error(`IA (${proveedorActual()}) respondió ${r.status}: ${texto.slice(0, 400)}`);
    err.status = r.status;
    throw err;
  }
  return JSON.parse(texto);
}

async function responder({ system, messages, tools }) {
  if (process.env.MODO_PRUEBA === 'si') return respuestaPrueba(messages);
  const p = proveedorActual();
  if (p === 'gemini') return gemini(system, messages, tools);
  if (p === 'anthropic') return anthropic(system, messages, tools);
  if (p === 'openai' || p === 'groq') return compatibleOpenAI(system, messages, tools);
  throw new Error(`IA_PROVEEDOR no reconocido: "${p}". Usa gemini, anthropic, openai o groq.`);
}

// ---------- OpenAI / Groq / cualquier API compatible ----------
// Cada proveedor usa SU clave y nada mas. Antes se cogia
// "OPENAI_API_KEY || GROQ_API_KEY", asi que en cuanto se anadio OPENAI_API_KEY
// para la recepcionista de voz, el chat empezo a mandarsela a Groq y este
// respondia 401: se caia entero sin que nada lo dijera.
async function compatibleOpenAI(system, messages, tools) {
  const p = proveedorActual();
  const nombreClave = p === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY';
  const clave = process.env[nombreClave];
  if (!clave) throw new Error(`Falta ${nombreClave}: es la clave que necesita IA_PROVEEDOR="${p}".`);
  const base = (process.env.IA_BASE_URL || BASE_COMPATIBLE[p] || BASE_COMPATIBLE.openai).replace(/\/$/, '');

  const msgs = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'tool') {
      msgs.push({ role: 'tool', tool_call_id: m.toolCallId, content: String(m.content) });
    } else if (m.toolCalls) {
      msgs.push({ role: 'assistant', content: m.content || null, tool_calls: m.toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.args) } })) });
    } else {
      msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') });
    }
  }

  const cuerpo = { model: modeloActual(), temperature: 0.3, max_tokens: 800, messages: msgs };
  if (tools && tools.length) {
    cuerpo.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    cuerpo.tool_choice = 'auto';
  }

  const j = await pedir(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${clave}` },
    body: JSON.stringify(cuerpo),
  });
  const msg = j.choices?.[0]?.message || {};
  const toolCalls = (msg.tool_calls || []).map((t) => ({ id: t.id, name: t.function?.name, args: parseArgs(t.function?.arguments) }));
  return { text: (msg.content || '').trim() || null, toolCalls };
}

// ---------- Gemini ----------
async function gemini(system, messages, tools) {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) throw new Error('Falta GEMINI_API_KEY.');

  const contents = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      contents.push({ role: 'user', parts: [{ functionResponse: { name: m.name, response: { resultado: String(m.content) } } }] });
    } else if (m.toolCalls) {
      contents.push({ role: 'model', parts: m.toolCalls.map((t) => ({ functionCall: { name: t.name, args: t.args } })) });
    } else {
      contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] });
    }
  }

  const cuerpo = {
    system_instruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
  };
  if (tools && tools.length) {
    cuerpo.tools = [{ function_declarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modeloActual()}:generateContent?key=${clave}`;
  const j = await pedir(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const parts = j.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => p.text).map((p) => p.text).join('').trim() || null;
  const toolCalls = parts.filter((p) => p.functionCall).map((p, i) => ({ id: 'g' + i, name: p.functionCall.name, args: p.functionCall.args || {} }));
  return { text, toolCalls };
}

// ---------- Anthropic ----------
async function anthropic(system, messages, tools) {
  const clave = process.env.ANTHROPIC_API_KEY;
  if (!clave) throw new Error('Falta ANTHROPIC_API_KEY.');

  const msgs = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      msgs.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: String(m.content) }] });
    } else if (m.toolCalls) {
      msgs.push({ role: 'assistant', content: [
        ...(m.content ? [{ type: 'text', text: m.content }] : []),
        ...m.toolCalls.map((t) => ({ type: 'tool_use', id: t.id, name: t.name, input: t.args })),
      ] });
    } else {
      msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') });
    }
  }

  const cuerpo = { model: modeloActual(), max_tokens: 800, temperature: 0.3, system, messages: msgs };
  if (tools && tools.length) cuerpo.tools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));

  const j = await pedir('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': clave, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(cuerpo),
  });
  const blocks = j.content || [];
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() || null;
  const toolCalls = blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input || {} }));
  return { text, toolCalls };
}

function parseArgs(s) {
  if (!s) return {};
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return {}; }
}

// ---------- MODO_PRUEBA: simula el flujo sin llamar a ninguna API ----------
// Imita a un modelo que hace las cosas bien: coge el servicio y los datos de lo
// que ha dicho el visitante y no reserva hasta tenerlos. Si se inventara el
// cliente (como hacía antes) las pruebas locales no valdrían para nada, porque
// el servidor rechaza por diseño las reservas con datos que nadie ha dado.
function respuestaPrueba(messages) {
  const ult = [...messages].reverse();
  const ultTool = ult.find((m) => m.role === 'tool');
  const dicho = messages.filter((m) => m.role === 'user' && typeof m.content === 'string')
    .map((m) => m.content).join(' \n ');
  const ultUser = ult.find((m) => m.role === 'user' && typeof m.content === 'string')?.content || '';

  const servicio = servicioMencionado(dicho);
  const email = (dicho.match(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i) || [])[0] || '';
  const telefono = (dicho.match(/(?:\+?\d[\d\s.-]{7,})/) || [])[0] || '';
  const nombre = (dicho.match(/\b(?:[Mm]e\s+llamo|[Mm]i\s+nombre\s+es|[Ss]oy)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/) || [])[1] || '';

  if (ultTool && ultTool.name === 'ver_huecos') {
    let vacio = false;
    try { vacio = (JSON.parse(ultTool.content).huecos || []).length === 0; } catch {}
    if (vacio) return { text: 'Ahora mismo no tengo huecos libres. ¿Te ayudo con otra cosa?', toolCalls: [] };
    if (!nombre || !telefono) return { text: 'Tengo huecos. ¿Me dices tu nombre y un teléfono y cuál te viene mejor?', toolCalls: [] };
    return { text: null, toolCalls: [{ id: 't2', name: 'reservar_cita', args: { slotId: 0, servicio, lead: { nombre, telefono, email, servicio } } }] };
  }
  if (ultTool && ultTool.name === 'reservar_cita') {
    let ok = false;
    try { ok = !!JSON.parse(ultTool.content).ok; } catch {}
    return { text: ok ? 'Listo, tu cita queda confirmada. Te llamamos a ese número.'
                      : 'Perdona, no he podido cerrarla. ¿Me repites los datos?', toolCalls: [] };
  }
  // Ya tenemos sus datos y en su momento se le ofrecieron huecos: a reservar.
  const ofrecidos = messages.some((m) => m.role === 'assistant' && /hueco/i.test(String(m.content || '')));
  if (nombre && telefono && ofrecidos) {
    return { text: null, toolCalls: [{ id: 't2', name: 'reservar_cita', args: { slotId: 0, servicio, lead: { nombre, telefono, email, servicio } } }] };
  }
  if (/\b(cita|reserv|hueco|agend|disponib|auditor|web|automatiz)/i.test(ultUser)) {
    return { text: null, toolCalls: [{ id: 't1', name: 'ver_huecos', args: { servicio } }] };
  }
  return { text: 'Puedo ayudarte a reservar una cita cuando quieras. ¿Te la busco?', toolCalls: [] };
}

// El servicio de negocio.json que mejor encaje con lo que ha dicho el visitante.
function servicioMencionado(texto) {
  const servicios = (require('./config').cargar().servicios || []).map((s) => s.nombre);
  const t = String(texto || '').toLowerCase();
  const pega = (n) => n.toLowerCase().split(/\s+/).some((p) => p.length > 3 && t.includes(p.slice(0, 6)));
  return servicios.find(pega) || servicios[0] || '';
}

module.exports = { responder, proveedorActual, modeloActual };
