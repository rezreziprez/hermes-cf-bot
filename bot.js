export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        await handleUpdate(update, env);
        return new Response('OK');
      } catch (e) {
        return new Response('Error: ' + e.message, { status: 500 });
      }
    }
    return new Response('Hermes Agent by iprez', { status: 200 });
  },
};

const MODELS = {
  '1': { id: 'gemini/gemini-3.5-flash-lite', name: 'Gemini Flash Lite', desc: 'Fast, free' },
  '2': { id: 'Xk/qwen/qwen3.8-max', name: 'Qwen 3.8 Max', desc: 'Powerful reasoning' },
  '3': { id: 'Xk/deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', desc: 'Fast & smart' },
  '4': { id: 'Xk/xiaomi/mimo-v2.5:free', name: 'MiMo V2.5', desc: 'Free model' },
  '5': { id: 'gemini/gemma-4-31b-it', name: 'Gemma 4 31B', desc: 'Google model' },
};

const DEFAULT_MODEL = 'gemini/gemini-3.5-flash-lite';

async function handleUpdate(update, env) {
  const msg = update.message;
  if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const name = msg.chat.first_name || 'User';
  const adminId = env.ADMIN_CHAT_ID;
  if (adminId && String(chatId) !== String(adminId)) {
    await send(env, chatId, 'Access denied.');
    return;
  }
  await upsertUser(env, chatId, msg.chat.username, name);

  // Commands
  if (text === '/start') {
    return send(env, chatId, 'Hi ' + name + '! I am Hermes Agent.\n\nCommands:\n/models - Show models\n/model [name] - Set model\n/clear - Clear history\n/system [text] - Set prompt\n/settings - Show settings');
  }
  if (text === '/clear') {
    await env.DB.prepare('DELETE FROM messages WHERE chat_id = ?').bind(chatId).run();
    return send(env, chatId, 'History cleared.');
  }
  if (text === '/models') {
    let list = 'Available models:\n\n';
    for (const [key, m] of Object.entries(MODELS)) {
      list += key + '. ' + m.name + ' - ' + m.desc + '\n';
    }
    list += '\nUse /model [number] to switch.';
    return send(env, chatId, list);
  }
  if (text.startsWith('/model')) {
    const arg = text.replace('/model', '').trim();
    if (!arg) return send(env, chatId, 'Use: /model [number]\nType /models to see list.');
    const m = MODELS[arg];
    if (!m) return send(env, chatId, 'Invalid number. Type /models to see list.');
    await env.DB.prepare('UPDATE users SET model = ? WHERE chat_id = ?').bind(m.id, chatId).run();
    return send(env, chatId, 'Model: ' + m.name + '\n' + m.desc);
  }
  if (text.startsWith('/system')) {
    const p = text.replace('/system', '').trim();
    if (!p) return send(env, chatId, 'Provide a prompt.');
    await env.DB.prepare('UPDATE users SET system_prompt = ? WHERE chat_id = ?').bind(p, chatId).run();
    return send(env, chatId, 'System prompt set.');
  }
  if (text === '/settings') {
    const s = await env.DB.prepare('SELECT system_prompt, model FROM users WHERE chat_id = ?').bind(chatId).first();
    const currentModel = s?.model || DEFAULT_MODEL;
    const modelName = Object.values(MODELS).find(m => m.id === currentModel)?.name || currentModel;
    return send(env, chatId, 'Model: ' + modelName + '\nPrompt: ' + (s?.system_prompt || 'default') + '\nAPI: 9router');
  }

  // AI chat
  await saveMsg(env, chatId, 'user', text);
  const history = await getHistory(env, chatId, 20);
  const settings = await env.DB.prepare('SELECT system_prompt, model FROM users WHERE chat_id = ?').bind(chatId).first();
  try {
    const sysPrompt = settings?.system_prompt || env.SYSTEM_PROMPT || 'You are a helpful AI assistant. Your name is Hermes, built by iprez.';
    const model = settings?.model || env.MODEL_NAME || DEFAULT_MODEL;
    const base = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.OPENAI_API_KEY },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: sysPrompt }, ...history], max_tokens: 2048, temperature: 0.7, stream: false })
    });
    const raw = await res.text();
    var data;
    try { data = JSON.parse(raw); } catch(e) {
      var lines = raw.split('\n');
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('data: ') && !lines[i].includes('[DONE]')) {
          try { data = JSON.parse(lines[i].slice(6)); break; } catch(e2) {}
        }
      }
      if (!data) data = {error: raw.substring(0, 200)};
    }
    const reply = data.choices?.[0]?.message?.content || (data.error ? JSON.stringify(data.error) : 'No response.');
    await saveMsg(env, chatId, 'assistant', reply);
    return send(env, chatId, reply);
  } catch (e) {
    return send(env, chatId, 'Error: ' + e.message);
  }
}

async function send(env, chatId, text) {
  const chunks = []; let t = text;
  while (t.length > 0) { if (t.length <= 4000) { chunks.push(t); break; } let c = t.lastIndexOf('\n', 4000); if (c === -1 || c < 2000) c = 4000; chunks.push(t.slice(0, c)); t = t.slice(c); }
  for (const chunk of chunks) {
    await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk })
    });
  }
}
async function saveMsg(env, chatId, role, content) { await env.DB.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)').bind(chatId, role, content).run(); }
async function getHistory(env, chatId, limit) { const { results } = await env.DB.prepare('SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?').bind(chatId, limit).all(); return results ? results.reverse() : []; }
async function upsertUser(env, chatId, username, firstName) { await env.DB.prepare("INSERT INTO users (chat_id, username, first_name, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(chat_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, updated_at=datetime('now')").bind(chatId, username||null, firstName||null).run(); }
