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
  '1': { id: 'gemini/gemini-3.5-flash-lite', name: 'Gemini Flash Lite', desc: 'Fast, free', tags: ['fast','general','free'] },
  '2': { id: 'Xk/qwen/qwen3.8-max', name: 'Qwen 3.8 Max', desc: 'Powerful reasoning', tags: ['smart','reasoning','code'] },
  '3': { id: 'Xk/deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', desc: 'Fast & smart', tags: ['code','fast','smart'] },
  '4': { id: 'Xk/xiaomi/mimo-v2.5:free', name: 'MiMo V2.5', desc: 'Free model', tags: ['free','general'] },
  '5': { id: 'gemini/gemma-4-31b-it', name: 'Gemma 4 31B', desc: 'Google model', tags: ['general','smart'] },
};

const DEFAULT_MODEL = 'gemini/gemini-3.5-flash-lite';
const AGENT_SYSTEM_PROMPT = 'You are Hermes Agent, a smart AI assistant by iprez. You have access to web search and image generation. When users ask about current events, news, or anything requiring real-time info, tell them to use /search command. When they want images, tell them to use /img command.';

async function handleUpdate(update, env) {
  const msg = update.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const name = msg.chat.first_name || 'User';
  const adminId = env.ADMIN_CHAT_ID;
  if (adminId && String(chatId) !== String(adminId)) {
    await send(env, chatId, 'Access denied.');
    return;
  }
  await upsertUser(env, chatId, msg.chat.username, name);

  // Handle photo messages (describe image)
  if (msg.photo) {
    return send(env, chatId, 'Use /img [description] to generate images.\nI cannot see photos yet.');
  }

  const text = msg.text ? msg.text.trim() : '';
  if (!text) return;

  // Commands
  if (text === '/start') {
    return send(env, chatId, 'Hi ' + name + '! I am Hermes Agent.\n\n' +
      'Chat:\nJust send a message to chat with AI\n\n' +
      'Commands:\n' +
      '/models - Show AI models\n' +
      '/model [number] - Switch model\n' +
      '/agent - Toggle Agent mode (auto-pick best model)\n' +
      '/search [query] - Search the web\n' +
      '/img [description] - Generate image\n' +
      '/clear - Clear history\n' +
      '/system [text] - Set system prompt\n' +
      '/settings - Show settings');
  }

  if (text === '/clear') {
    await env.DB.prepare('DELETE FROM messages WHERE chat_id = ?').bind(chatId).run();
    return send(env, chatId, 'History cleared.');
  }

  if (text === '/models') {
    const s = await env.DB.prepare('SELECT model, agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();
    const currentModel = s?.model || DEFAULT_MODEL;
    const agentMode = s?.agent_mode ? true : false;
    let list = (agentMode ? 'Agent mode: ON (auto model selection)\n\n' : '') + 'Models:\n\n';
    for (const [key, m] of Object.entries(MODELS)) {
      const active = m.id === currentModel ? ' ✅' : '';
      list += key + '. ' + m.name + ' - ' + m.desc + active + '\n';
    }
    list += '\n/model [number] to switch\n/agent to toggle auto selection';
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

  if (text === '/agent') {
    const s = await env.DB.prepare('SELECT agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();
    const newMode = s?.agent_mode ? 0 : 1;
    await env.DB.prepare('UPDATE users SET agent_mode = ? WHERE chat_id = ?').bind(newMode, chatId).run();
    if (newMode) {
      return send(env, chatId, 'Agent mode ON\nI will auto-pick the best model for each task:\n- General chat -> Gemini Flash\n- Code/Logic -> DeepSeek/Qwen\n- Simple tasks -> MiMo');
    } else {
      return send(env, chatId, 'Agent mode OFF\nUsing your selected model. Use /model to change.');
    }
  }

  // Web search
  if (text.startsWith('/search')) {
    const query = text.replace('/search', '').trim();
    if (!query) return send(env, chatId, 'Use: /search [query]\nExample: /search what is AI');
    await typing(env, chatId);
    try {
      const results = await webSearch(query);
      await send(env, chatId, results);
    } catch (e) {
      await send(env, chatId, 'Search error: ' + e.message);
    }
    return;
  }

  // Image generation - /img, /img1-5
  if (text.startsWith('/img')) {
    const parts = text.split(' ');
    const cmd = parts[0];
    const prompt = parts.slice(1).join(' ');
    const modelMap = {'/img1': 'flux-realism', '/img2': 'flux-anime', '/img3': 'flux-3d', '/img4': 'turbo', '/img5': 'sana', '/img6': 'flux-schnell', '/img7': 'flux-pro', '/img8': 'stable-diffusion-xl', '/img9': 'playground-v2.5', '/img10': 'kandinsky-3'};
    const model = modelMap[cmd];
    if (!prompt && cmd === '/img') return send(env, chatId, 'Image models:\n/img1 - Flux Realistic\n/img2 - Flux Anime\n/img3 - Flux 3D\n/img4 - Turbo (fast)\n/img5 - Sana\n/img6 - Flux Schnell\n/img7 - Flux Pro\n/img8 - SDXL\n/img9 - Playground 2.5\n/img10 - Kandinsky 3\n\nDefault: /img = Flux');
    if (!prompt) return send(env, chatId, 'Provide description.');
    await typing(env, chatId);
    try {
      const seed = Math.floor(Math.random() * 999999);
      const modelParam = model ? '&model=' + model : '';
      const label = model ? '[' + model + '] ' : '[flux] ';
      const imgUrl = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=1024&height=1024&nologo=true' + modelParam + '&seed=' + seed;
      await sendPhoto(env, chatId, imgUrl, label + prompt);
    } catch (e) {
      await send(env, chatId, 'Image error: ' + e.message);
    }
    return;
  }


  if (text.startsWith('/system')) {
    const p = text.replace('/system', '').trim();
    if (!p) return send(env, chatId, 'Provide a prompt.');
    await env.DB.prepare('UPDATE users SET system_prompt = ? WHERE chat_id = ?').bind(p, chatId).run();
    return send(env, chatId, 'System prompt set.');
  }

  if (text === '/settings') {
    const s = await env.DB.prepare('SELECT system_prompt, model, agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();
    const currentModel = s?.model || DEFAULT_MODEL;
    const modelName = Object.values(MODELS).find(m => m.id === currentModel)?.name || currentModel;
    const agentStatus = s?.agent_mode ? 'ON' : 'OFF';
    return send(env, chatId, 'Model: ' + modelName + '\nAgent: ' + agentStatus + '\nPrompt: ' + (s?.system_prompt || 'default') + '\nAPI: 9router');
  }

  // AI chat
  await saveMsg(env, chatId, 'user', text);
  await typing(env, chatId);

  const history = await getHistory(env, chatId, 20);
  const settings = await env.DB.prepare('SELECT system_prompt, model, agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();

  // Agent mode: auto-pick best model
  let model = settings?.model || env.MODEL_NAME || DEFAULT_MODEL;
  if (settings?.agent_mode) {
    model = await pickBestModel(text, env);
  }

  try {
    const sysPrompt = settings?.system_prompt || env.SYSTEM_PROMPT || AGENT_SYSTEM_PROMPT;
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
    const modelLabel = settings?.agent_mode ? '\n\n[Model: ' + (Object.values(MODELS).find(m => m.id === model)?.name || model) + ']' : '';
    return send(env, chatId, reply + modelLabel);
  } catch (e) {
    return send(env, chatId, 'Error: ' + e.message);
  }
}

// Pick best model based on query content
async function pickBestModel(text, env) {
  const lower = text.toLowerCase();
  // Code-related
  if (lower.match(/\b(code|function|debug|error|program|script|api|database|sql|python|javascript|html|css|bug|fix|implement)\b/)) {
    return 'Xk/deepseek/deepseek-v4-flash';
  }
  // Reasoning/complex
  if (lower.match(/\b(explain|why|how|analyze|compare|think|reason|math|calculate|prove|theory)\b/) && text.length > 50) {
    return 'Xk/qwen/qwen3.8-max';
  }
  // Default: Gemini Flash Lite for everything else
  return 'gemini/gemini-3.5-flash-lite';
}

// Web search using DuckDuckGo
async function webSearch(query) {
  const url = 'https://lite.duckduckgo.com/lite/';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'q=' + encodeURIComponent(query)
  });
  const html = await resp.text();
  // Extract results from HTML
  const results = [];
  const linkRegex = /<a[^>]+class="result-link"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
  const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;
  
  let match;
  const links = [];
  while ((match = linkRegex.exec(html)) !== null) {
    links.push({ url: match[1], title: match[2].trim() });
  }
  
  const snippets = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(match[1].replace(/<[^>]*>/g, '').trim());
  }
  
  if (links.length === 0) {
    // Try alternative parsing
    const altRegex = /<a[^>]+rel="nofollow"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    while ((match = altRegex.exec(html)) !== null && results.length < 5) {
      const t = match[2].trim();
      if (t && t.length > 5) {
        results.push('**' + t + '**\n' + match[1]);
      }
    }
  } else {
    for (let i = 0; i < Math.min(links.length, 5); i++) {
      const s = snippets[i] || '';
      results.push('**' + links[i].title + '**\n' + (s ? s + '\n' : '') + links[i].url);
    }
  }
  
  if (results.length === 0) return 'No results found for: ' + query;
  
  let output = 'Search: ' + query + '\n\n';
  for (let i = 0; i < results.length; i++) {
    output += (i + 1) + '. ' + results[i] + '\n\n';
  }
  return output.trim();
}

// Send typing action
async function typing(env, chatId) {
  try {
    await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendChatAction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' })
    });
  } catch (e) {}
}

// Send photo
async function sendPhoto(env, chatId, photoUrl, caption) {
  await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendPhoto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption: caption || '' })
  });
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
