export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try { const update = await request.json(); await handleUpdate(update, env); return new Response('OK'); }
      catch (e) { return new Response('Error', { status: 500 }); }
    }
    return new Response('Hermes CF Bot by iprez', { status: 200 });
  },
};

async function handleUpdate(update, env) {
  const msg = update.message;
  if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const name = msg.chat.first_name || 'User';
  const adminId = env.ADMIN_CHAT_ID;
  if (adminId && String(chatId) !== String(adminId)) { await send(env, chatId, 'Access denied.'); return; }
  await upsertUser(env, chatId, msg.chat.username, name);
  if (text === '/start') return send(env, chatId, 'Hi ' + name + '! Commands: /clear /system [text] /model [name] /settings');
  if (text === '/clear') { await env.DB.prepare('DELETE FROM messages WHERE chat_id = ?').bind(chatId).run(); return send(env, chatId, 'History cleared.'); }
  if (text.startsWith('/system')) { const p = text.replace('/system','').trim(); if(!p) return send(env,chatId,'Provide a prompt.'); await env.DB.prepare('UPDATE users SET system_prompt = ? WHERE chat_id = ?').bind(p,chatId).run(); return send(env,chatId,'Prompt set.'); }
  if (text.startsWith('/model')) { const m = text.replace('/model','').trim(); if(!m) return send(env,chatId,'Provide model name.'); await env.DB.prepare('UPDATE users SET model = ? WHERE chat_id = ?').bind(m,chatId).run(); return send(env,chatId,'Model: '+m); }
  if (text === '/settings') { const s = await env.DB.prepare('SELECT system_prompt, model FROM users WHERE chat_id = ?').bind(chatId).first(); return send(env,chatId,'Model: '+(s?.model||env.MODEL_NAME||'default')+'\nPrompt: '+(s?.system_prompt||env.SYSTEM_PROMPT||'default')+'\nAPI: '+(env.OPENAI_BASE_URL||'default')); }
  await saveMsg(env, chatId, 'user', text);
  const history = await getHistory(env, chatId, 20);
  const settings = await env.DB.prepare('SELECT system_prompt, model FROM users WHERE chat_id = ?').bind(chatId).first();
  try {
    const sysPrompt = settings?.system_prompt || env.SYSTEM_PROMPT || 'You are a helpful assistant.';
    const model = settings?.model || env.MODEL_NAME || 'gpt-4o-mini';
    const base = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const res = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.OPENAI_API_KEY }, body: JSON.stringify({ model, messages: [{ role: 'system', content: sysPrompt }, ...history], max_tokens: 2048, temperature: 0.7 }) });
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || (data.error ? JSON.stringify(data.error) : 'No response.');
    await saveMsg(env, chatId, 'assistant', reply);
    return send(env, chatId, reply);
  } catch (e) { return send(env, chatId, 'Error: ' + e.message); }
}

async function send(env, chatId, text) {
  const chunks = []; let t = text;
  while (t.length > 0) { if (t.length <= 4000) { chunks.push(t); break; } let c = t.lastIndexOf('\n', 4000); if (c === -1 || c < 2000) c = 4000; chunks.push(t.slice(0, c)); t = t.slice(c); }
  for (const chunk of chunks) { await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: chunk }) }); }
}
async function saveMsg(env, chatId, role, content) { await env.DB.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)').bind(chatId, role, content).run(); }
async function getHistory(env, chatId, limit) { const { results } = await env.DB.prepare('SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?').bind(chatId, limit).all(); return results ? results.reverse() : []; }
async function upsertUser(env, chatId, username, firstName) { await env.DB.prepare("INSERT INTO users (chat_id, username, first_name, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(chat_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, updated_at=datetime('now')").bind(chatId, username||null, firstName||null).run(); }
