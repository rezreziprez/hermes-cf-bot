export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        if (update.callback_query) {
          await handleCallback(update.callback_query, env);
        } else {
          await handleUpdate(update, env);
        }
        return new Response('OK');
      } catch (e) {
        return new Response('Error: ' + e.message, { status: 500 });
      }
    }
    return new Response('Hermes Agent by iprez', { status: 200 });
  },
};

// Models
const MODELS = {
  '1': { id: 'gemini/gemini-3.5-flash-lite', name: 'Gemini Flash Lite', icon: '⚡', desc: 'Fast, free' },
  '2': { id: 'Xk/qwen/qwen3.8-max', name: 'Qwen 3.8 Max', icon: '🧠', desc: 'Smart reasoning' },
  '3': { id: 'Xk/deepseek/deepseek-v4-flash', name: 'DeepSeek V4', icon: '💻', desc: 'Code expert' },
  '4': { id: 'Xk/xiaomi/mimo-v2.5:free', name: 'MiMo V2.5', icon: '🤖', desc: 'Free model' },
  '5': { id: 'gemini/gemma-4-31b-it', name: 'Gemma 4 31B', icon: '💎', desc: 'Google model' },
};
const DEFAULT_MODEL = 'gemini/gemini-3.5-flash-lite';

// ========== INLINE KEYBOARDS ==========
function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '🤖 مدل‌ها', callback_data: 'models' }, { text: '🔍 جستجو', callback_data: 'search_help' }],
      [{ text: '🖼️ تصویر', callback_data: 'img_help' }, { text: '🌐 ترجمه', callback_data: 'tr_help' }],
      [{ text: '⚙️ تنظیمات', callback_data: 'settings' }, { text: '👤 پروفایل', callback_data: 'profile' }],
      [{ text: '🧹 پاک‌سازی', callback_data: 'clear_confirm' }, { text: 'ℹ️ راهنما', callback_data: 'help' }]
    ]
  };
}

function modelsKeyboard(currentModel) {
  const buttons = [];
  for (const [key, m] of Object.entries(MODELS)) {
    const check = m.id === currentModel ? '✅ ' : '';
    buttons.push([{ text: check + m.icon + ' ' + m.name, callback_data: 'setmodel_' + key }]);
  }
  buttons.push([{ text: '🔄 حالت Agent', callback_data: 'toggle_agent' }]);
  buttons.push([{ text: '🔙 بازگشت', callback_data: 'main_menu' }]);
  return { inline_keyboard: buttons };
}

function imgModelsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🎨 Flux Realistic', callback_data: 'imgm_1' }, { text: '🎌 Flux Anime', callback_data: 'imgm_2' }],
      [{ text: '🧊 Flux 3D', callback_data: 'imgm_3' }, { text: '⚡ Turbo', callback_data: 'imgm_4' }],
      [{ text: '🌸 Sana', callback_data: 'imgm_5' }, { text: '🚀 Schnell', callback_data: 'imgm_6' }],
      [{ text: '⭐ Flux Pro', callback_data: 'imgm_7' }, { text: '🎭 CablyAI', callback_data: 'imgm_8' }],
      [{ text: '📐 Flux 2D', callback_data: 'imgm_9' }, { text: '✨ Spark', callback_data: 'imgm_10' }],
      [{ text: '🔙 بازگشت', callback_data: 'main_menu' }]
    ]
  };
}

function confirmClear() {
  return {
    inline_keyboard: [
      [{ text: '✅ بله، پاک کن', callback_data: 'clear_yes' }, { text: '❌ نه، لغو', callback_data: 'main_menu' }]
    ]
  };
}

function settingsKeyboard(agentMode) {
  return {
    inline_keyboard: [
      [{ text: '🤖 مدل: ' + (MODELS['1']?.name || 'Default'), callback_data: 'models' }],
      [{ text: '🧠 Agent Mode: ' + (agentMode ? '✅ فعال' : '❌ غیرفعال'), callback_data: 'toggle_agent' }],
      [{ text: '📝 پرامپت سفارشی', callback_data: 'prompt_help' }],
      [{ text: '🔙 بازگشت', callback_data: 'main_menu' }]
    ]
  };
}

// ========== CALLBACK HANDLER ==========
async function handleCallback(cb, env) {
  const chatId = cb.message.chat.id;
  const msgId = cb.message.message_id;
  const data = cb.data;
  const name = cb.from.first_name || 'User';

  if (data === 'main_menu') {
    return editMessage(env, chatId, msgId, '🌟 **منوی اصلی Hermes Agent**\n\n━━━━━━━━━━━━━━━━━━━\n🤖 دستیار هوش مصنوعی شما\n🎨 ساخته شده توسط **iprez**\n━━━━━━━━━━━━━━━━━━━\n\nیکی از گزینه‌ها رو انتخاب کن:', mainMenu());
  }

  if (data === 'models') {
    const s = await env.DB.prepare('SELECT model, agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();
    const currentModel = s?.model || DEFAULT_MODEL;
    const agentStatus = s?.agent_mode ? '✅ فعال' : '❌ غیرفعال';
    let text = '🤖 **انتخاب مدل هوش مصنوعی**\n━━━━━━━━━━━━━━━━━━━\n\n🧠 Agent Mode: ' + agentStatus + '\n\n';
    for (const [key, m] of Object.entries(MODELS)) {
      const active = m.id === currentModel ? ' ◀️' : '';
      text += m.icon + ' **' + m.name + '** — ' + m.desc + active + '\n';
    }
    text += '\n━━━━━━━━━━━━━━━━━━━';
    return editMessage(env, chatId, msgId, text, modelsKeyboard(currentModel));
  }

  if (data.startsWith('setmodel_')) {
    const key = data.replace('setmodel_', '');
    const m = MODELS[key];
    if (!m) return;
    await env.DB.prepare('UPDATE users SET model = ?, agent_mode = 0 WHERE chat_id = ?').bind(m.id, chatId).run();
    return editMessage(env, chatId, msgId, '✅ مدل تغییر کرد!\n\n' + m.icon + ' **' + m.name + '**\n' + m.desc, modelsKeyboard(m.id));
  }

  if (data === 'toggle_agent') {
    const s = await env.DB.prepare('SELECT agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();
    const newMode = s?.agent_mode ? 0 : 1;
    await env.DB.prepare('UPDATE users SET agent_mode = ? WHERE chat_id = ?').bind(newMode, chatId).run();
    const status = newMode ? '✅ Agent Mode فعال شد!\n\n🤖 الان خودم بهترین مدل رو انتخاب میکنم:\n• کد → DeepSeek\n• تحلیل → Qwen\n• عمومی → Gemini' : '❌ Agent Mode غیرفعال شد.\nاز /model استفاده کن.';
    return editMessage(env, chatId, msgId, status, settingsKeyboard(newMode));
  }

  if (data === 'settings') {
    const s = await env.DB.prepare('SELECT model, agent_mode, system_prompt FROM users WHERE chat_id = ?').bind(chatId).first();
    const modelName = Object.values(MODELS).find(m => m.id === (s?.model || DEFAULT_MODEL))?.name || 'Default';
    const agentStatus = s?.agent_mode ? '✅ فعال' : '❌ غیرفعال';
    const text = '⚙️ **تنظیمات**\n━━━━━━━━━━━━━━━━━━━\n\n🤖 مدل: **' + modelName + '**\n🧠 Agent: **' + agentStatus + '**\n📝 پرامپت: **' + (s?.system_prompt || 'پیش‌فرض') + '**\n🌐 API: **9router**\n\n━━━━━━━━━━━━━━━━━━━';
    return editMessage(env, chatId, msgId, text, settingsKeyboard(s?.agent_mode));
  }

  if (data === 'profile') {
    const s = await env.DB.prepare('SELECT * FROM users WHERE chat_id = ?').bind(chatId).first();
    const msgCount = await env.DB.prepare('SELECT COUNT(*) as c FROM messages WHERE chat_id = ?').bind(chatId).first();
    const modelName = Object.values(MODELS).find(m => m.id === (s?.model || DEFAULT_MODEL))?.name || 'Default';
    const text = '👤 **پروفایل شما**\n━━━━━━━━━━━━━━━━━━━\n\n🏷️ نام: **' + (s?.first_name || name) + '**\n🤖 مدل: **' + modelName + '**\n🧠 Agent: **' + (s?.agent_mode ? 'فعال' : 'غیرفعال') + '**\n📊 پیام‌ها: **' + (msgCount?.c || 0) + '**\n📅 عضویت: **' + (s?.created_at || 'نامشخص') + '**\n\n━━━━━━━━━━━━━━━━━━━';
    return editMessage(env, chatId, msgId, text, mainMenu());
  }

  if (data === 'clear_confirm') {
    return editMessage(env, chatId, msgId, '⚠️ **آیا مطمئن هستید؟**\n\nاین کار تمام تاریخچه مکالمه رو پاک میکنه!', confirmClear());
  }

  if (data === 'clear_yes') {
    await env.DB.prepare('DELETE FROM messages WHERE chat_id = ?').bind(chatId).run();
    return editMessage(env, chatId, msgId, '🧹 **تاریخچه پاک شد!**\n\nاز الان مکالمه جدید شروع میشه.', mainMenu());
  }

  if (data === 'help') {
    const text = 'ℹ️ **راهنمای Hermes Agent**\n━━━━━━━━━━━━━━━━━━━\n\n💬 **چت:** فقط پیام بفرست\n🔍 **جستجو:** /search [query]\n🖼️ **تصویر:** /img [description]\n🌐 **ترجمه:** /tr [text]\n🧹 **پاک‌سازی:** /clear\n⚙️ **تنظیمات:** /settings\n\n**مدل‌های تصویری:**\n/img1 تا /img10\n\n━━━━━━━━━━━━━━━━━━━';
    return editMessage(env, chatId, msgId, text, mainMenu());
  }

  if (data === 'search_help') {
    return editMessage(env, chatId, msgId, '🔍 **جستجوی وب**\n\nاز دستور زیر استفاده کن:\n`/search [سوال شما]`\n\nمثال:\n`/search آب و هوای تهران`\n`/search what is AI`', mainMenu());
  }

  if (data === 'img_help') {
    return editMessage(env, chatId, msgId, '🖼️ **تولید تصویر**\n\nاز دستور زیر استفاده کن:\n`/img [توضیحات]`\n\n**مدل‌های مختلف:**\n/img1 — واقع‌گرایانه\n/img2 — انیمه\n/img3 — سه‌بعدی\n/img4 — سریع\n/img5 تا /img10 — مدل‌های بیشتر', imgModelsKeyboard());
  }

  if (data === 'tr_help') {
    return editMessage(env, chatId, msgId, '🌐 **ترجمه هوشمند**\n\nاز دستور زیر استفاده کن:\n`/tr [متن]`\n\nمثال:\n`/tr Hello, how are you?`\n\nترجمه خودکار به فارسی انجام میشه.', mainMenu());
  }

  if (data === 'prompt_help') {
    return editMessage(env, chatId, msgId, '📝 **پرامپت سفارشی**\n\nاز دستور زیر استفاده کن:\n`/system [پرامپت شما]`\n\nمثال:\n`/system تو یه دستیار کدنویسی هستی`\n\nبرای حذف:\n`/system default`', mainMenu());
  }

  // Image model selection from inline keyboard
  if (data.startsWith('imgm_')) {
    const imgModels = {'1':'flux-realism','2':'flux-anime','3':'flux-3d','4':'turbo','5':'sana','6':'flux-schnell','7':'flux-pro','8':'flux-cablyai','9':'flux-2d-v2','10':'flux-spark'};
    const key = data.replace('imgm_', '');
    const model = imgModels[key];
    if (!model) return;
    return editMessage(env, chatId, msgId, '🖼️ مدل **' + model + '** انتخاب شد.\n\nحالا عکست رو بفرست:\n`/img [توضیحات]`\n\nیا با مدل مستقیم:\n`/img' + key + ' [توضیحات]`', imgModelsKeyboard());
  }

  answerCallback(env, cb.id);
}

// ========== MESSAGE HANDLER ==========
async function handleUpdate(update, env) {
  const msg = update.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const name = msg.chat.first_name || 'User';
  const adminId = env.ADMIN_CHAT_ID;
  if (adminId && String(chatId) !== String(adminId)) {
    return send(env, chatId, '⛔ Access denied.');
  }
  await upsertUser(env, chatId, msg.chat.username, name);

  if (msg.photo) {
    return send(env, chatId, '📸 عکس دریافت شد!\n\nبرای تولید تصویر از /img استفاده کن.');
  }

  const text = msg.text ? msg.text.trim() : '';
  if (!text) return;

  // ===== /start =====
  if (text === '/start') {
    const welcome = '━━━━━━━━━━━━━━━━━━━\n🌟 **به Hermes Agent خوش آمدید!**\n━━━━━━━━━━━━━━━━━━━\n\n🤖 دستیار هوش مصنوعی شما\n🎨 ساخته شده توسط **iprez**\n\n│ 🔍 جستجوی وب  │ 🖼️ تصویر     │\n│ 🤖 Agent Mode  │ 🌐 ترجمه      │\n│ 💻 کدنویسی     │ ⚙️ تنظیمات    │\n\n━━━━━━━━━━━━━━━━━━━';
    return sendWithKeyboard(env, chatId, welcome, mainMenu());
  }

  // ===== /clear =====
  if (text === '/clear') {
    return sendWithKeyboard(env, chatId, '⚠️ **آیا مطمئن هستید؟**\n\nتمام تاریخچه مکالمه پاک میشه!', confirmClear());
  }

  // ===== /models =====
  if (text === '/models') {
    const s = await env.DB.prepare('SELECT model, agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();
    const currentModel = s?.model || DEFAULT_MODEL;
    const agentStatus = s?.agent_mode ? '✅ فعال' : '❌ غیرفعال';
    let list = '🤖 **انتخاب مدل**\n━━━━━━━━━━━━━━━━━━━\n🧠 Agent: ' + agentStatus + '\n\n';
    for (const [key, m] of Object.entries(MODELS)) {
      const active = m.id === currentModel ? ' ◀️' : '';
      list += m.icon + ' **' + m.name + '** — ' + m.desc + active + '\n';
    }
    list += '\n━━━━━━━━━━━━━━━━━━━';
    return sendWithKeyboard(env, chatId, list, modelsKeyboard(currentModel));
  }

  // ===== /model =====
  if (text.startsWith('/model')) {
    const arg = text.replace('/model', '').trim();
    if (!arg) return sendWithKeyboard(env, chatId, '🤖 یک مدل انتخاب کن:', modelsKeyboard(DEFAULT_MODEL));
    const m = MODELS[arg];
    if (!m) return send(env, chatId, '❌ شماره نامعتبر. /models رو بزن.');
    await env.DB.prepare('UPDATE users SET model = ?, agent_mode = 0 WHERE chat_id = ?').bind(m.id, chatId).run();
    return send(env, chatId, '✅ ' + m.icon + ' **' + m.name + '** انتخاب شد.\n' + m.desc);
  }

  // ===== /agent =====
  if (text === '/agent') {
    const s = await env.DB.prepare('SELECT agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();
    const newMode = s?.agent_mode ? 0 : 1;
    await env.DB.prepare('UPDATE users SET agent_mode = ? WHERE chat_id = ?').bind(newMode, chatId).run();
    const status = newMode ? '✅ **Agent Mode فعال!**\n\n🤖 خودم بهترین مدل رو انتخاب میکنم:\n• 💻 کد → DeepSeek V4\n• 🧠 تحلیل → Qwen 3.8\n• ⚡ عمومی → Gemini Flash' : '❌ **Agent Mode غیرفعال!**\nاز /model برای انتخاب دستی استفاده کن.';
    return sendWithKeyboard(env, chatId, status, settingsKeyboard(newMode));
  }

  // ===== /search =====
  if (text.startsWith('/search')) {
    const query = text.replace('/search', '').trim();
    if (!query) return send(env, chatId, '🔍 استفاده: `/search [سوال]`');
    await typing(env, chatId, 'search');
    try {
      const results = await webSearch(query);
      return send(env, chatId, results);
    } catch (e) {
      return send(env, chatId, '❌ خطا در جستجو: ' + e.message);
    }
  }

  // ===== /img =====
  if (text.startsWith('/img')) {
    const parts = text.split(' ');
    const cmd = parts[0];
    const prompt = parts.slice(1).join(' ');
    const imgModelMap = {'/img1':'flux-realism','/img2':'flux-anime','/img3':'flux-3d','/img4':'turbo','/img5':'sana','/img6':'flux-schnell','/img7':'flux-pro','/img8':'flux-cablyai','/img9':'flux-2d-v2','/img10':'flux-spark'};
    if (!prompt && cmd === '/img') {
      return sendWithKeyboard(env, chatId, '🖼️ **تولید تصویر**\n\nیک مدل انتخاب کن:', imgModelsKeyboard());
    }
    if (!prompt) return send(env, chatId, '❌ توضیحات تصویر رو بنویس.');
    await typing(env, chatId, 'upload_photo');
    try {
      const model = imgModelMap[cmd];
      const seed = Math.floor(Math.random() * 999999);
      const modelParam = model ? '&model=' + model : '';
      const enhance = model === 'flux-realism' ? '&enhance=true' : '';
      const imgUrl = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=1024&height=1024&nologo=true' + modelParam + enhance + '&seed=' + seed;
      const label = model ? '[' + model + '] ' : '[flux] ';
      await sendPhoto(env, chatId, imgUrl, label + prompt);
    } catch (e) {
      await send(env, chatId, '❌ خطا: ' + e.message);
    }
    return;
  }

  // ===== /tr =====
  if (text.startsWith('/tr')) {
    const t = text.replace('/tr', '').trim();
    if (!t) return send(env, chatId, '🌐 استفاده: `/tr [متن]`');
    await typing(env, chatId, 'typing');
    await saveMsg(env, chatId, 'user', 'translate: ' + t);
    const reply = await callAI(env, chatId, [{role:'system',content:'You are a translator. Translate the user text to Persian (Farsi). Only output the translation, nothing else.'},{role:'user',content:t}], DEFAULT_MODEL);
    return send(env, chatId, '🌐 **ترجمه:**\n\n' + reply);
  }

  // ===== /system =====
  if (text.startsWith('/system')) {
    const p = text.replace('/system', '').trim();
    if (!p || p === 'default') {
      await env.DB.prepare('UPDATE users SET system_prompt = NULL WHERE chat_id = ?').bind(chatId).run();
      return send(env, chatId, '✅ پرامپت به حالت پیش‌فرض برگشت.');
    }
    await env.DB.prepare('UPDATE users SET system_prompt = ? WHERE chat_id = ?').bind(p, chatId).run();
    return send(env, chatId, '✅ **پرامپت تنظیم شد:**\n\n' + p);
  }

  // ===== /settings =====
  if (text === '/settings') {
    const s = await env.DB.prepare('SELECT model, agent_mode, system_prompt FROM users WHERE chat_id = ?').bind(chatId).first();
    const modelName = Object.values(MODELS).find(m => m.id === (s?.model || DEFAULT_MODEL))?.name || 'Default';
    const agentStatus = s?.agent_mode ? '✅ فعال' : '❌ غیرفعال';
    const settings = '⚙️ **تنظیمات**\n━━━━━━━━━━━━━━━━━━━\n\n🤖 مدل: **' + modelName + '**\n🧠 Agent: **' + agentStatus + '**\n📝 پرامپت: **' + (s?.system_prompt || 'پیش‌فرض') + '**\n🌐 API: **9router**\n\n━━━━━━━━━━━━━━━━━━━';
    return sendWithKeyboard(env, chatId, settings, settingsKeyboard(s?.agent_mode));
  }

  // ===== /profile =====
  if (text === '/profile') {
    const s = await env.DB.prepare('SELECT * FROM users WHERE chat_id = ?').bind(chatId).first();
    const msgCount = await env.DB.prepare('SELECT COUNT(*) as c FROM messages WHERE chat_id = ?').bind(chatId).first();
    const modelName = Object.values(MODELS).find(m => m.id === (s?.model || DEFAULT_MODEL))?.name || 'Default';
    const profile = '👤 **پروفایل شما**\n━━━━━━━━━━━━━━━━━━━\n\n🏷️ نام: **' + (s?.first_name || name) + '**\n🤖 مدل: **' + modelName + '**\n🧠 Agent: **' + (s?.agent_mode ? 'فعال' : 'غیرفعال') + '**\n📊 پیام‌ها: **' + (msgCount?.c || 0) + '**\n📅 عضویت: **' + (s?.created_at || 'نامشخص') + '**\n\n━━━━━━━━━━━━━━━━━━━';
    return sendWithKeyboard(env, chatId, profile, mainMenu());
  }

  // ===== AI CHAT =====
  await saveMsg(env, chatId, 'user', text);
  await typing(env, chatId, 'typing');

  const history = await getHistory(env, chatId, 20);
  const settings = await env.DB.prepare('SELECT system_prompt, model, agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();
  let model = settings?.model || env.MODEL_NAME || DEFAULT_MODEL;
  if (settings?.agent_mode) {
    model = pickBestModel(text);
  }

  try {
    const sysPrompt = settings?.system_prompt || env.SYSTEM_PROMPT || 'You are Hermes Agent, a smart AI assistant by iprez.';
    const reply = await callAI(env, chatId, [{role:'system',content:sysPrompt}, ...history], model);
    await saveMsg(env, chatId, 'assistant', reply);
    const modelLabel = settings?.agent_mode ? '\n\n🤖 _' + (Object.values(MODELS).find(m => m.id === model)?.name || model) + '_' : '';
    return send(env, chatId, reply + modelLabel);
  } catch (e) {
    return send(env, chatId, '❌ خطا: ' + e.message);
  }
}

// ========== AI CALL ==========
async function callAI(env, chatId, messages, model) {
  const base = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.OPENAI_API_KEY },
    body: JSON.stringify({ model, messages, max_tokens: 2048, temperature: 0.7, stream: false })
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
  return data.choices?.[0]?.message?.content || (data.error ? JSON.stringify(data.error) : 'No response.');
}

// ========== MODEL PICKER ==========
function pickBestModel(text) {
  const lower = text.toLowerCase();
  if (lower.match(/\b(code|function|debug|error|program|script|api|database|sql|python|javascript|html|css|bug|fix)\b/)) return 'Xk/deepseek/deepseek-v4-flash';
  if (lower.match(/\b(explain|why|how|analyze|compare|think|reason|math|prove)\b/) && text.length > 50) return 'Xk/qwen/qwen3.8-max';
  return 'gemini/gemini-3.5-flash-lite';
}

// ========== WEB SEARCH ==========
async function webSearch(query) {
  const resp = await fetch('https://lite.duckduckgo.com/lite/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'q=' + encodeURIComponent(query)
  });
  const html = await resp.text();
  const results = [];
  const linkRegex = /<a[^>]+rel="nofollow"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null && results.length < 5) {
    const t = match[2].trim();
    if (t && t.length > 5) results.push('**' + t + '**\n' + match[1]);
  }
  if (results.length === 0) return '❌ نتیجه‌ای پیدا نشد.';
  let output = '🔍 **نتایج جستجو:**\n━━━━━━━━━━━━━━━━━━━\n\n';
  for (let i = 0; i < results.length; i++) output += (i+1) + '. ' + results[i] + '\n\n';
  return output.trim();
}

// ========== TELEGRAM API ==========
async function typing(env, chatId, action) {
  try {
    await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendChatAction', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: action || 'typing' })
    });
  } catch (e) {}
}

async function send(env, chatId, text) {
  const chunks = []; let t = text;
  while (t.length > 0) { if (t.length <= 4000) { chunks.push(t); break; } let c = t.lastIndexOf('\n', 4000); if (c === -1 || c < 2000) c = 4000; chunks.push(t.slice(0, c)); t = t.slice(c); }
  for (const chunk of chunks) {
    await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' })
    });
  }
}

async function sendWithKeyboard(env, chatId, text, keyboard) {
  await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: keyboard })
  });
}

async function editMessage(env, chatId, msgId, text, keyboard) {
  await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/editMessageText', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: msgId, text, parse_mode: 'Markdown', reply_markup: keyboard })
  });
}

async function sendPhoto(env, chatId, photoUrl, caption) {
  await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendPhoto', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption })
  });
}

async function answerCallback(env, cbId) {
  await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/answerCallbackQuery', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: cbId })
  });
}

// ========== DATABASE ==========
async function saveMsg(env, chatId, role, content) { await env.DB.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)').bind(chatId, role, content).run(); }
async function getHistory(env, chatId, limit) { const { results } = await env.DB.prepare('SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?').bind(chatId, limit).all(); return results ? results.reverse() : []; }
async function upsertUser(env, chatId, username, firstName) { await env.DB.prepare("INSERT INTO users (chat_id, username, first_name, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(chat_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, updated_at=datetime('now')").bind(chatId, username||null, firstName||null).run(); }
