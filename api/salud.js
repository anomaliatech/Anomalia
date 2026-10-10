// Comprobación de salud para el monitor de caídas (UptimeRobot, Better Stack…).
// 200 = la web y el chat tienen lo que necesitan; 503 = algo falta y el chat
// estaría contestando con el mensaje de "escríbenos a contacto@".
// No llama a ninguna API de pago y no dice QUÉ falta: solo cuántas cosas.
const CLAVE_IA = { groq: 'GROQ_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', openrouter: 'OPENROUTER_API_KEY' };

function comprobar(env) {
  const proveedor = (env.IA_PROVEEDOR || 'gemini').toLowerCase();
  const necesarias = [CLAVE_IA[proveedor] || 'IA_PROVEEDOR', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'RESEND_API_KEY', 'CRON_TOKEN'];
  let problemas = necesarias.filter((k) => !env[k]).length;
  if (env.MODO_PRUEBA === 'si') problemas++; // el chat estaría simulando, no reservando
  try { require('../lib/config').cargar(); } catch { problemas++; }
  return problemas;
}

module.exports = (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD');
    return res.status(405).json({ error: 'usa GET' });
  }
  const problemas = comprobar(process.env);
  const ok = problemas === 0;
  return res.status(ok ? 200 : 503).json(ok ? { ok: true } : { ok: false, problemas });
};
module.exports.comprobar = comprobar;
