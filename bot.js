export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    if (url.pathname === '/webapp') return new Response(getWebAppHTML(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        if (update.callback_query) {
          await handleCallback(update.callback_query, env);
        } else if (update.message) {
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

// ========== WEB APP HTML ==========
function getWebAppHTML() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hermes Agent</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { 
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--tg-theme-bg-color, #0f0f0f);
  color: var(--tg-theme-text-color, #fff);
  padding: 16px;
  min-height: 100vh;
}
.header {
  text-align: center;
  padding: 20px 0;
  border-bottom: 1px solid #333;
  margin-bottom: 20px;
}
.header h1 { font-size: 22px; color: #7c4dff; }
.header p { font-size: 13px; color: #888; margin-top: 4px; }
.section-title { 
  font-size: 14px; 
  color: #888; 
  margin: 16px 0 8px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.btn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
.btn {
  padding: 14px 16px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
}
.btn:active { transform: scale(0.95); opacity: 0.8; }
.btn-blue { background: linear-gradient(135deg, #2196F3, #1565C0); }
.btn-green { background: linear-gradient(135deg, #4CAF50, #2E7D32); }
.btn-red { background: linear-gradient(135deg, #f44336, #c62828); }
.btn-purple { background: linear-gradient(135deg, #7c4dff, #651fff); }
.btn-orange { background: linear-gradient(135deg, #FF9800, #EF6C00); }
.btn-teal { background: linear-gradient(135deg, #009688, #00695C); }
.btn-pink { background: linear-gradient(135deg, #E91E63, #AD1457); }
.btn-cyan { background: linear-gradient(135deg, #00BCD4, #00838F); }
.btn-full { grid-column: 1 / -1; }
.btn-icon { font-size: 18px; }
.divider { height: 1px; background: #333; margin: 16px 0; }
.model-item {
  padding: 12px 16px;
  background: #1a1a2e;
  border-radius: 10px;
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
}
.model-item:active { background: #2a2a4e; }
.model-item.active { border: 2px solid #7c4dff; }
.model-name { font-weight: 600; }
.model-desc { font-size: 12px; color: #888; }
.model-check { color: #7c4dff; font-size: 18px; }
.profile-card {
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 20px;
}
.profile-row { 
  display: flex; 
  justify-content: space-between; 
  padding: 8px 0;
  border-bottom: 1px solid #2a2a4e;
}
.profile-row:last-child { border: none; }
.profile-label { color: #888; }
.profile-value { font-weight: 600; }
.hidden { display: none; }
</style>
</head>
<body>

<div id="main-page">
  <div class="header">
    <h1>🌟 Hermes Agent</h1>
    <p>ساخته شده توسط iprez</p>
  </div>

  <div class="btn-grid">
    <button class="btn btn-blue" onclick="showPage('models-page')">
      <span class="btn-icon">🤖</span> مدل‌ها
    </button>
    <button class="btn btn-green" onclick="doSearch()">
      <span class="btn-icon">🔍</span> جستجوی وب
    </button>
    <button class="btn btn-purple" onclick="showPage('img-page')">
      <span class="btn-icon">🖼️</span> تولید تصویر
    </button>
    <button class="btn btn-teal" onclick="doTranslate()">
      <span class="btn-icon">🌐</span> ترجمه
    </button>
    <button class="btn btn-orange" onclick="showPage('profile-page')">
      <span class="btn-icon">👤</span> پروفایل من
    </button>
    <button class="btn btn-pink" onclick="showPage('settings-page')">
      <span class="btn-icon">⚙️</span> تنظیمات
    </button>
    <button class="btn btn-red" onclick="clearHistory()">
      <span class="btn-icon">🧹</span> پاک‌سازی
    </button>
    <button class="btn btn-cyan" onclick="showPage('help-page')">
      <span class="btn-icon">ℹ️</span> راهنما
    </button>
  </div>
</div>

<div id="models-page" class="hidden">
  <button class="btn btn-full btn-blue" onclick="showPage('main-page')" style="margin-bottom:16px">🔙 بازگشت</button>
  <div class="section-title">انتخاب مدل هوش مصنوعی</div>
  <div id="models-list"></div>
  <div class="divider"></div>
  <button class="btn btn-full btn-purple" onclick="toggleAgent()">🧠 Agent Mode (Auto)</button>
</div>

<div id="img-page" class="hidden">
  <button class="btn btn-full btn-blue" onclick="showPage('main-page')" style="margin-bottom:16px">🔙 بازگشت</button>
  <div class="section-title">مدل‌های تصویری</div>
  <div class="btn-grid">
    <button class="btn btn-red" onclick="sendImgCmd(1)"><span class="btn-icon">🎨</span> Realistic</button>
    <button class="btn btn-pink" onclick="sendImgCmd(2)"><span class="btn-icon">🎌</span> Anime</button>
    <button class="btn btn-teal" onclick="sendImgCmd(3)"><span class="btn-icon">🧊</span> 3D</button>
    <button class="btn btn-orange" onclick="sendImgCmd(4)"><span class="btn-icon">⚡</span> Turbo</button>
    <button class="btn btn-purple" onclick="sendImgCmd(5)"><span class="btn-icon">🌸</span> Sana</button>
    <button class="btn btn-cyan" onclick="sendImgCmd(6)"><span class="btn-icon">🚀</span> Schnell</button>
    <button class="btn btn-blue" onclick="sendImgCmd(7)"><span class="btn-icon">⭐</span> Pro</button>
    <button class="btn btn-green" onclick="sendImgCmd(8)"><span class="btn-icon">🎭</span> CablyAI</button>
  </div>
</div>

<div id="profile-page" class="hidden">
  <button class="btn btn-full btn-blue" onclick="showPage('main-page')" style="margin-bottom:16px">🔙 بازگشت</button>
  <div class="profile-card" id="profile-info"></div>
</div>

<div id="settings-page" class="hidden">
  <button class="btn btn-full btn-blue" onclick="showPage('main-page')" style="margin-bottom:16px">🔙 بازگشت</button>
  <div class="section-title">تنظیمات</div>
  <div class="btn-grid">
    <button class="btn btn-blue btn-full" onclick="showPage('models-page')">🤖 انتخاب مدل</button>
    <button class="btn btn-purple btn-full" onclick="toggleAgent()">🧠 Agent Mode</button>
    <button class="btn btn-teal btn-full" onclick="setPrompt()">📝 پرامپت سفارشی</button>
    <button class="btn btn-red btn-full" onclick="clearHistory()">🧹 پاک‌سازی تاریخچه</button>
  </div>
</div>

<div id="help-page" class="hidden">
  <button class="btn btn-full btn-blue" onclick="showPage('main-page')" style="margin-bottom:16px">🔙 بازگشت</button>
  <div class="section-title">راهنما</div>
  <div style="background:#1a1a2e;border-radius:12px;padding:16px;font-size:13px;line-height:2">
    💬 <b>چت:</b> فقط پیام بفرست<br>
    🔍 <b>جستجو:</b> /search [query]<br>
    🖼️ <b>تصویر:</b> /img [description]<br>
    🌐 <b>ترجمه:</b> /tr [text]<br>
    🧹 <b>پاک‌سازی:</b> /clear<br>
    ⚙️ <b>تنظیمات:</b> /settings<br>
    👤 <b>پروفایل:</b> /profile<br>
    🤖 <b>مدل‌ها:</b> /models<br>
    🧠 <b>Agent:</b> /agent
  </div>
</div>

<script>
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const MODELS = [
  {id:'1',icon:'⚡',name:'Gemini Flash Lite',desc:'Fast, free'},
  {id:'2',icon:'🧠',name:'Qwen 3.8 Max',desc:'Smart reasoning'},
  {id:'3',icon:'💻',name:'DeepSeek V4',desc:'Code expert'},
  {id:'4',icon:'🤖',name:'MiMo V2.5',desc:'Free model'},
  {id:'5',icon:'💎',name:'Gemma 4 31B',desc:'Google model'}
];

function showPage(id) {
  document.querySelectorAll('[id$="-page"]').forEach(p => p.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function sendCmd(cmd) {
  tg.sendData(JSON.stringify({cmd: cmd}));
  tg.close();
}

function sendImgCmd(n) {
  sendCmd('img_' + n);
}

function doSearch() {
  tg.sendData(JSON.stringify({cmd: 'search_prompt'}));
  tg.close();
}

function doTranslate() {
  tg.sendData(JSON.stringify({cmd: 'tr_prompt'}));
  tg.close();
}

function setPrompt() {
  tg.sendData(JSON.stringify({cmd: 'prompt_prompt'}));
  tg.close();
}

function clearHistory() {
  if (confirm('آیا مطمئن هستید؟')) {
    sendCmd('clear');
  }
}

function toggleAgent() {
  sendCmd('toggle_agent');
}

// Render models
const list = document.getElementById('models-list');
MODELS.forEach(m => {
  const item = document.createElement('div');
  item.className = 'model-item';
  item.onclick = () => sendCmd('model_' + m.id);
  item.innerHTML = '<div><div class="model-name">' + m.icon + ' ' + m.name + '</div><div class="model-desc">' + m.desc + '</div></div>';
  list.appendChild(item);
});

// Render profile placeholder
document.getElementById('profile-info').innerHTML = '<div class="profile-row"><span class="profile-label">🏷️ نام</span><span class="profile-value">Loading...</span></div><div class="profile-row"><span class="profile-label">🤖 مدل</span><span class="profile-value">Loading...</span></div><div class="profile-row"><span class="profile-label">🧠 Agent</span><span class="profile-value">Loading...</span></div>';
</script>
</body>
</html>`;
}

// ========== MODELS ==========
const MODELS = {
  '1': { id: 'gemini/gemini-3.5-flash-lite', name: 'Gemini Flash Lite', icon: '⚡', desc: 'Fast, free' },
  '2': { id: 'Xk/qwen/qwen3.8-max', name: 'Qwen 3.8 Max', icon: '🧠', desc: 'Smart reasoning' },
  '3': { id: 'Xk/deepseek/deepseek-v4-flash', name: 'DeepSeek V4', icon: '💻', desc: 'Code expert' },
  '4': { id: 'Xk/xiaomi/mimo-v2.5:free', name: 'MiMo V2.5', icon: '🤖', desc: 'Free model' },
  '5': { id: 'gemini/gemma-4-31b-it', name: 'Gemma 4 31B', icon: '💎', desc: 'Google model' },
};
const DEFAULT_MODEL = 'gemini/gemini-3.5-flash-lite';

// ========== KEYBOARDS ==========
function mainMenu(webAppUrl) {
  return {
    inline_keyboard: [
      [{ text: '🌟 Mini App', web_app: { url: 'https://tma-gcnrbcx4.r65.workers.dev' }, style: 'primary' }],
      [{ text: '🤖 مدل‌ها', callback_data: 'models', style: 'primary' }, { text: '🔍 جستجو', callback_data: 'search_help', style: 'primary' }],
      [{ text: '🖼️ تصویر', callback_data: 'img_help', style: 'success' }, { text: '🌐 ترجمه', callback_data: 'tr_help', style: 'success' }],
      [{ text: '⚙️ تنظیمات', callback_data: 'settings' }, { text: '👤 پروفایل', callback_data: 'profile' }]
    ]
  };
}

function modelsKeyboard(currentModel) {
  const buttons = [];
  for (const [key, m] of Object.entries(MODELS)) {
    const check = m.id === currentModel ? '✅ ' : '  ';
    const style = m.id === currentModel ? 'success' : 'primary';
    buttons.push([{ text: check + m.icon + ' ' + m.name + '  │  ' + m.desc, callback_data: 'setmodel_' + key, style }]);
  }
  buttons.push([{ text: '🧠 Agent Mode (Auto)', callback_data: 'toggle_agent', style: 'primary' }]);
  buttons.push([{ text: '🔙 بازگشت', callback_data: 'main_menu' }]);
  return { inline_keyboard: buttons };
}

function confirmClear() {
  return { inline_keyboard: [[{ text: '✅ بله، پاک کن', callback_data: 'clear_yes', style: 'danger' }, { text: '❌ نه', callback_data: 'main_menu', style: 'primary' }]] };
}

function imgModelsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🎨 Realistic', callback_data: 'imgm_1', style: 'primary' }, { text: '🎌 Anime', callback_data: 'imgm_2', style: 'primary' }],
      [{ text: '🧊 3D', callback_data: 'imgm_3', style: 'success' }, { text: '⚡ Turbo', callback_data: 'imgm_4', style: 'success' }],
      [{ text: '🌸 Sana', callback_data: 'imgm_5', style: 'primary' }, { text: '🚀 Schnell', callback_data: 'imgm_6', style: 'primary' }],
      [{ text: '⭐ Pro', callback_data: 'imgm_7', style: 'success' }, { text: '🎭 CablyAI', callback_data: 'imgm_8', style: 'success' }],
      [{ text: '🔙 بازگشت', callback_data: 'main_menu' }]
    ]
  };
}

function settingsKeyboard(agentMode) {
  return {
    inline_keyboard: [
      [{ text: '🤖 انتخاب مدل', callback_data: 'models', style: 'primary' }],
      [{ text: '🧠 Agent Mode  │  ' + (agentMode ? '✅ فعال' : '❌ غیرفعال'), callback_data: 'toggle_agent', style: agentMode ? 'success' : 'danger' }],
      [{ text: '📝 پرامپت سفارشی', callback_data: 'prompt_help' }],
      [{ text: '🧹 پاک‌سازی', callback_data: 'clear_confirm', style: 'danger' }],
      [{ text: '🔙 بازگشت', callback_data: 'main_menu' }]
    ]
  };
}

// ========== WEB APP DATA HANDLER ==========
async function handleWebAppData(data, env) {
  // This would be called when web app sends data
  // For now, handled via callback
}

// ========== CALLBACK HANDLER ==========
async function handleCallback(cb, env) {
  const chatId = cb.message.chat.id;
  const msgId = cb.message.message_id;
  const data = cb.data;

  if (data === 'noop') return answerCallback(env, cb.id);

  if (data === 'main_menu') {
    const webAppUrl = 'https://hermes-bot.r65.workers.dev/webapp';
    return editMessage(env, chatId, msgId, '🌟 **Hermes Agent**\n\n━━━━━━━━━━━━━━━━━━━\n🤖 دستیار هوش مصنوعی شما\n🎨 ساخته شده توسط **iprez**\n━━━━━━━━━━━━━━━━━━━', mainMenu(webAppUrl));
  }

  if (data === 'models') {
    const s = await env.DB.prepare('SELECT model, agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();
    const currentModel = s?.model || DEFAULT_MODEL;
    let text = '🤖 **انتخاب مدل**\n━━━━━━━━━━━━━━━━━━━\n\n';
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
    const status = newMode ? '✅ **Agent Mode فعال!**\n\n🤖 خودم بهترین مدل رو انتخاب میکنم:\n• 💻 کد → DeepSeek\n• 🧠 تحلیل → Qwen\n• ⚡ عمومی → Gemini' : '❌ **Agent Mode غیرفعال!**';
    return editMessage(env, chatId, msgId, status, settingsKeyboard(newMode));
  }

  if (data === 'settings') {
    const s = await env.DB.prepare('SELECT model, agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();
    return editMessage(env, chatId, msgId, '⚙️ **تنظیمات**\n━━━━━━━━━━━━━━━━━━━', settingsKeyboard(s?.agent_mode));
  }

  if (data === 'profile') {
    const s = await env.DB.prepare('SELECT * FROM users WHERE chat_id = ?').bind(chatId).first();
    const msgCount = await env.DB.prepare('SELECT COUNT(*) as c FROM messages WHERE chat_id = ?').bind(chatId).first();
    const modelName = Object.values(MODELS).find(m => m.id === (s?.model || DEFAULT_MODEL))?.name || 'Default';
    const text = '👤 **پروفایل**\n━━━━━━━━━━━━━━━━━━━\n\n🏷️ نام: **' + (s?.first_name || 'User') + '**\n🤖 مدل: **' + modelName + '**\n🧠 Agent: **' + (s?.agent_mode ? 'فعال' : 'غیرفعال') + '**\n📊 پیام‌ها: **' + (msgCount?.c || 0) + '**\n\n━━━━━━━━━━━━━━━━━━━';
    const webAppUrl = 'https://hermes-bot.r65.workers.dev/webapp';
    return editMessage(env, chatId, msgId, text, mainMenu(webAppUrl));
  }

  if (data === 'clear_confirm') return editMessage(env, chatId, msgId, '⚠️ **آیا مطمئن هستید؟**', confirmClear());
  if (data === 'clear_yes') {
    await env.DB.prepare('DELETE FROM messages WHERE chat_id = ?').bind(chatId).run();
    return editMessage(env, chatId, msgId, '🧹 **تاریخچه پاک شد!**', mainMenu('https://hermes-bot.r65.workers.dev/webapp'));
  }

  if (data === 'search_help') return editMessage(env, chatId, msgId, '🔍 **جستجوی وب**\n\n`/search [سوال شما]`', mainMenu('https://hermes-bot.r65.workers.dev/webapp'));
  if (data === 'img_help') return editMessage(env, chatId, msgId, '🖼️ **تولید تصویر**\n\n`/img [توضیحات]`\n\n/img1 تا /img8', imgModelsKeyboard());
  if (data === 'tr_help') return editMessage(env, chatId, msgId, '🌐 **ترجمه**\n\n`/tr [متن]`', mainMenu('https://hermes-bot.r65.workers.dev/webapp'));
  if (data === 'prompt_help') return editMessage(env, chatId, msgId, '📝 **پرامپت**\n\n`/system [پرامپت]`', mainMenu('https://hermes-bot.r65.workers.dev/webapp'));
  if (data === 'help') return editMessage(env, chatId, msgId, 'ℹ️ **راهنما**\n\n💬 /start | 🔍 /search | 🖼️ /img\n🌐 /tr | 🧹 /clear | ⚙️ /settings', mainMenu('https://hermes-bot.r65.workers.dev/webapp'));

  if (data.startsWith('imgm_')) {
    const n = data.replace('imgm_', '');
    return editMessage(env, chatId, msgId, '🖼️ مدل انتخاب شد.\n\n`/img' + n + ' [توضیحات]`', imgModelsKeyboard());
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
  if (adminId && String(chatId) !== String(adminId)) return send(env, chatId, '⛔ Access denied.');
  await upsertUser(env, chatId, msg.chat.username, name);

  // Handle web_app data
  if (msg.web_app_data) {
    try {
      const data = JSON.parse(msg.web_app_data.data);
      if (data.cmd === 'clear') {
        await env.DB.prepare('DELETE FROM messages WHERE chat_id = ?').bind(chatId).run();
        return send(env, chatId, '🧹 تاریخچه پاک شد!');
      }
      if (data.cmd === 'toggle_agent') {
        const s = await env.DB.prepare('SELECT agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();
        const newMode = s?.agent_mode ? 0 : 1;
        await env.DB.prepare('UPDATE users SET agent_mode = ? WHERE chat_id = ?').bind(newMode, chatId).run();
        return send(env, chatId, newMode ? '✅ Agent Mode فعال!' : '❌ Agent Mode غیرفعال!');
      }
      if (data.cmd && data.cmd.startsWith('model_')) {
        const key = data.cmd.replace('model_', '');
        const m = MODELS[key];
        if (m) {
          await env.DB.prepare('UPDATE users SET model = ?, agent_mode = 0 WHERE chat_id = ?').bind(m.id, chatId).run();
          return send(env, chatId, '✅ مدل: ' + m.icon + ' ' + m.name);
        }
      }
      if (data.cmd && data.cmd.startsWith('img_')) {
        // Will be handled by /img command
      }
      if (data.cmd === 'search_prompt') return send(env, chatId, '🔍 سوال خود رو بنویس:\n/search [سوال]');
      if (data.cmd === 'tr_prompt') return send(env, chatId, '🌐 متن رو بنویس:\n/tr [متن]');
      if (data.cmd === 'prompt_prompt') return send(env, chatId, '📝 پرامپت رو بنویس:\n/system [پرامپت]');
    } catch (e) {}
    return;
  }

  // Photo handling with Gemini Flash Lite vision
  if (msg.photo) {
    await typing(env, chatId);
    try {
      const photos = msg.photo.sort((a, b) => b.file_size - a.file_size);
      const fileId = photos[0].file_id;
      const fileResp = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/getFile?file_id=' + fileId);
      const fileData = await fileResp.json();
      if (fileData.ok) {
        const imgUrl = 'https://api.telegram.org/file/bot' + env.TELEGRAM_BOT_TOKEN + '/' + fileData.result.file_path;
        const visionResp = await fetch(env.OPENAI_BASE_URL + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.OPENAI_API_KEY },
          body: JSON.stringify({
            model: 'gemini/gemini-3.5-flash-lite',
            messages: [{role:'user',content:[{type:'text',text:'Describe this image in detail.'},{type:'image_url',image_url:{url:imgUrl}}]}],
            max_tokens: 1000, stream: false
          })
        });
        const visionRaw = await visionResp.text();
        var visionData;
        try { visionData = JSON.parse(visionRaw); } catch(e) { visionData = {error: visionRaw.substring(0,200)}; }
        const reply = visionData.choices?.[0]?.message?.content || 'Error: ' + JSON.stringify(visionData.error || 'unknown');
        return send(env, chatId, reply);
      }
    } catch (e) { return send(env, chatId, '❌ خطا: ' + e.message); }
    return send(env, chatId, '❌ عکس دریافت نشد.');
  }
  const text = msg.text ? msg.text.trim() : '';
  if (!text) return;

  const webAppUrl = 'https://hermes-bot.r65.workers.dev/webapp';

  if (text === '/start') {
    const welcome = '━━━━━━━━━━━━━━━━━━━\n🌟 **به Hermes Agent خوش آمدید!**\n━━━━━━━━━━━━━━━━━━━\n\n🤖 دستیار هوش مصنوعی شما\n🎨 ساخته شده توسط **iprez**\n\n━━━━━━━━━━━━━━━━━━━';
    return sendWithKeyboard(env, chatId, welcome, mainMenu(webAppUrl));
  }

  if (text === '/clear') return sendWithKeyboard(env, chatId, '⚠️ مطمئن هستید؟', confirmClear());

  if (text.startsWith('/enhance')) return handleEnhance(env, chatId, text);
  if (text.startsWith('/upscale')) return handleUpscale(env, chatId, text);

  if (text === '/models') {
    const s = await env.DB.prepare('SELECT model, agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();
    const currentModel = s?.model || DEFAULT_MODEL;
    let list = '🤖 **انتخاب مدل**\n━━━━━━━━━━━━━━━━━━━\n\n';
    for (const [key, m] of Object.entries(MODELS)) {
      const active = m.id === currentModel ? ' ◀️' : '';
      list += m.icon + ' **' + m.name + '** — ' + m.desc + active + '\n';
    }
    return sendWithKeyboard(env, chatId, list + '\n━━━━━━━━━━━━━━━━━━━', modelsKeyboard(currentModel));
  }

  if (text.startsWith('/model')) {
    const arg = text.replace('/model', '').trim();
    if (!arg) return sendWithKeyboard(env, chatId, '🤖 یک مدل انتخاب کن:', modelsKeyboard(DEFAULT_MODEL));
    const m = MODELS[arg];
    if (!m) return send(env, chatId, '❌ شماره نامعتبر.');
    await env.DB.prepare('UPDATE users SET model = ?, agent_mode = 0 WHERE chat_id = ?').bind(m.id, chatId).run();
    return send(env, chatId, '✅ ' + m.icon + ' **' + m.name + '**');
  }

  if (text === '/agent') {
    const s = await env.DB.prepare('SELECT agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();
    const newMode = s?.agent_mode ? 0 : 1;
    await env.DB.prepare('UPDATE users SET agent_mode = ? WHERE chat_id = ?').bind(newMode, chatId).run();
    return sendWithKeyboard(env, chatId, newMode ? '✅ **Agent Mode فعال!**\n\n• 💻 کد → DeepSeek\n• 🧠 تحلیل → Qwen\n• ⚡ عمومی → Gemini' : '❌ **Agent Mode غیرفعال!**', settingsKeyboard(newMode));
  }

  if (text.startsWith('/search')) {
    const query = text.replace('/search', '').trim();
    if (!query) return send(env, chatId, '🔍 `/search [سوال]`');
    await typing(env, chatId);
    try { return send(env, chatId, await webSearch(query)); } catch (e) { return send(env, chatId, '❌ خطا'); }
  }

  if (text.startsWith('/img')) {
    const parts = text.split(' ');
    const cmd = parts[0]; const prompt = parts.slice(1).join(' ');
    const imgMap = {'/img1':'flux-realism','/img2':'flux-anime','/img3':'flux-3d','/img4':'turbo','/img5':'sana','/img6':'flux-schnell','/img7':'flux-pro','/img8':'flux-cablyai'};
    if (!prompt && cmd === '/img') return sendWithKeyboard(env, chatId, '🖼️ انتخاب مدل:', imgModelsKeyboard());
    if (!prompt) return send(env, chatId, '❌ توضیحات بنویس.');
    await typing(env, chatId);
    try {
      const model = imgMap[cmd];
      const seed = Math.floor(Math.random() * 999999);
      const mp = model ? '&model=' + model : '';
      const label = model ? '[' + model + '] ' : '[flux] ';
      await sendPhoto(env, chatId, 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=1024&height=1024&nologo=true' + mp + '&seed=' + seed, label + prompt);
    } catch (e) { await send(env, chatId, '❌ خطا'); }
    return;
  }

  if (text.startsWith('/tr')) {
    const t = text.replace('/tr', '').trim();
    if (!t) return send(env, chatId, '🌐 `/tr [متن]`');
    await typing(env, chatId);
    const reply = await callAI(env, [{role:'system',content:'Translate to Persian. Only output translation.'},{role:'user',content:t}], DEFAULT_MODEL);
    return send(env, chatId, '🌐 **ترجمه:**\n\n' + reply);
  }

  if (text.startsWith('/system')) {
    const p = text.replace('/system', '').trim();
    if (!p || p === 'default') { await env.DB.prepare('UPDATE users SET system_prompt = NULL WHERE chat_id = ?').bind(chatId).run(); return send(env, chatId, '✅ پرامپت پیش‌فرض'); }
    await env.DB.prepare('UPDATE users SET system_prompt = ? WHERE chat_id = ?').bind(p, chatId).run();
    return send(env, chatId, '✅ پرامپت تنظیم شد.');
  }

  if (text === '/settings') {
    const s = await env.DB.prepare('SELECT model, agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();
    return sendWithKeyboard(env, chatId, '⚙️ **تنظیمات**\n━━━━━━━━━━━━━━━━━━━', settingsKeyboard(s?.agent_mode));
  }

  if (text === '/profile') {
    const s = await env.DB.prepare('SELECT * FROM users WHERE chat_id = ?').bind(chatId).first();
    const mc = await env.DB.prepare('SELECT COUNT(*) as c FROM messages WHERE chat_id = ?').bind(chatId).first();
    const mn = Object.values(MODELS).find(m => m.id === (s?.model || DEFAULT_MODEL))?.name || 'Default';
    return sendWithKeyboard(env, chatId, '👤 **پروفایل**\n━━━━━━━━━━━━━━━━━━━\n\n🏷️ نام: **' + (s?.first_name || name) + '**\n🤖 مدل: **' + mn + '**\n🧠 Agent: **' + (s?.agent_mode ? 'فعال' : 'غیرفعال') + '**\n📊 پیام‌ها: **' + (mc?.c || 0) + '**\n\n━━━━━━━━━━━━━━━━━━━', mainMenu(webAppUrl));
  }

  // AI Chat
  await saveMsg(env, chatId, 'user', text);
  await typing(env, chatId);
  const history = await getHistory(env, chatId, 20);
  const settings = await env.DB.prepare('SELECT system_prompt, model, agent_mode FROM users WHERE chat_id = ?').bind(chatId).first();
  let model = settings?.model || env.MODEL_NAME || DEFAULT_MODEL;
  if (settings?.agent_mode) model = pickBestModel(text);

  try {
    const sysPrompt = settings?.system_prompt || env.SYSTEM_PROMPT || 'You are Hermes Agent by iprez.';
    const reply = await callAI(env, [{role:'system',content:sysPrompt}, ...history], model);
    await saveMsg(env, chatId, 'assistant', reply);
    const ml = settings?.agent_mode ? '\n\n🤖 _' + (Object.values(MODELS).find(m => m.id === model)?.name || model) + '_' : '';
    return send(env, chatId, reply + ml);
  } catch (e) { return send(env, chatId, '❌ خطا: ' + e.message); }
}

// ========== HELPERS ==========
function pickBestModel(text) {
  const l = text.toLowerCase();
  if (l.match(/\b(code|debug|script|api|python|javascript|bug)\b/)) return 'Xk/deepseek/deepseek-v4-flash';
  if (l.match(/\b(explain|analyze|reason|math|prove)\b/) && text.length > 50) return 'Xk/qwen/qwen3.8-max';
  return 'gemini/gemini-3.5-flash-lite';
}

async function webSearch(query) {
  const resp = await fetch('https://lite.duckduckgo.com/lite/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'q=' + encodeURIComponent(query) });
  const html = await resp.text();
  const results = []; const re = /<a[^>]+rel="nofollow"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
  let m; while ((m = re.exec(html)) !== null && results.length < 5) { const t = m[2].trim(); if (t && t.length > 5) results.push('**' + t + '**\n' + m[1]); }
  if (!results.length) return '❌ نتیجه‌ای پیدا نشد.';
  let o = '🔍 **نتایج:**\n━━━━━━━━━━━━━━━━━━━\n\n';
  results.forEach((r, i) => o += (i+1) + '. ' + r + '\n\n');
  return o.trim();
}

async function callAI(env, messages, model) {
  const base = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const res = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.OPENAI_API_KEY }, body: JSON.stringify({ model, messages, max_tokens: 2048, temperature: 0.7, stream: false }) });
  const raw = await res.text();
  var data; try { data = JSON.parse(raw); } catch(e) { var lines = raw.split('\n'); for (var i = 0; i < lines.length; i++) { if (lines[i].startsWith('data: ') && !lines[i].includes('[DONE]')) { try { data = JSON.parse(lines[i].slice(6)); break; } catch(e2) {} } } if (!data) data = {error: raw.substring(0, 200)}; }
  return data.choices?.[0]?.message?.content || (data.error ? JSON.stringify(data.error) : 'No response.');
}

async function typing(env, chatId) { try { await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendChatAction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: 'typing' }) }); } catch (e) {} }
async function send(env, chatId, text) { const chunks = []; let t = text; while (t.length > 0) { if (t.length <= 4000) { chunks.push(t); break; } let c = t.lastIndexOf('\n', 4000); if (c === -1 || c < 2000) c = 4000; chunks.push(t.slice(0, c)); t = t.slice(c); } for (const chunk of chunks) { await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }) }); } }
async function sendWithKeyboard(env, chatId, text, kb) { await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: kb }) }); }
async function editMessage(env, chatId, msgId, text, kb) { try { await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/editMessageText', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, message_id: msgId, text, parse_mode: 'Markdown', reply_markup: kb }) }); } catch (e) {} }
async function handleEnhance(env, chatId, text) {
  const prompt = text.replace(/^\/enhance(@\w+)?\s*/, '').trim();
  if (!prompt) return send(env, chatId, '🖼️ **Enhance تصویر**\n\nاستفاده: `/enhance [توضیح تصویر]`\n\nمثال:\n`/enhance a beautiful landscape`\n`/enhance portrait of a person`\n\n✅ کیفیت 4K، جزئیات بالا، وضوح بیشتر');

  await typing(env, chatId);
  const seed = Math.floor(Math.random() * 999999);
  const enhanced = encodeURIComponent(prompt + ', ultra high quality, 4k, 8k, highly detailed, sharp focus, professional photography, masterpiece, best quality, ultra realistic, hyper detailed, cinematic lighting');
  const url = 'https://image.pollinations.ai/prompt/' + enhanced + '?width=2048&height=2048&nologo=true&model=flux-pro&seed=' + seed + '&enhance=true';
  
  await sendPhoto(env, chatId, url, '✨ **Enhanced** — ' + prompt + '\n\n📐 2048x2048 | 🎨 Flux Pro | 🌟 کیفیت بالا');
}

async function handleUpscale(env, chatId, text) {
  const prompt = text.replace(/^\/upscale(@\w+)?\s*/, '').trim();
  if (!prompt) return send(env, chatId, '🔍 **Upscale تصویر**\n\nاستفاده: `/upscale [توضیح تصویر]`\n\nمثال:\n`/upscale a mountain view`\n`/upscale city at night`\n\n✅ افزایش رزولوشن تا 4K');

  await typing(env, chatId);
  const seed = Math.floor(Math.random() * 999999);
  const upscaled = encodeURIComponent(prompt + ', ultra high resolution, 4k uhd, 8k, extremely detailed, crystal clear, sharp, noise free, clean image');
  const url = 'https://image.pollinations.ai/prompt/' + upscaled + '?width=2048&height=2048&nologo=true&model=flux-pro&seed=' + seed;
  
  await sendPhoto(env, chatId, url, '🔍 **Upscaled** — ' + prompt + '\n\n📐 2048x2048 | 🎨 Flux Pro | 🔍 رزولوشن بالا');
}

async function sendPhoto(env, chatId, url, caption) { await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendPhoto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, photo: url, caption }) }); }
async function answerCallback(env, id) { await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/answerCallbackQuery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: id }) }); }
async function saveMsg(env, c, r, t) { await env.DB.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)').bind(c, r, t).run(); }
async function getHistory(env, c, l) { const { results } = await env.DB.prepare('SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?').bind(c, l).all(); return results ? results.reverse() : []; }
async function upsertUser(env, c, u, f) { await env.DB.prepare("INSERT INTO users (chat_id, username, first_name, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(chat_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, updated_at=datetime('now')").bind(c, u||null, f||null).run(); }
