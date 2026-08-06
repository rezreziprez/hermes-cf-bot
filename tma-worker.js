// Hermes AI Hub - Telegram Mini App Backend
// Deploy this as a separate Cloudflare Worker or add to existing bot

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS headers for TMA
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // Serve TMA files
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(getIndexHTML(), { 
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } 
      });
    }
    
    if (url.pathname === '/style.css') {
      return new Response(getStyleCSS(), { 
        headers: { 'Content-Type': 'text/css; charset=utf-8', ...corsHeaders } 
      });
    }
    
    if (url.pathname === '/app.js') {
      return new Response(getAppJS(), { 
        headers: { 'Content-Type': 'application/javascript; charset=utf-8', ...corsHeaders } 
      });
    }
    
    // API endpoints for TMA
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChatAPI(request, env, corsHeaders);
    }
    
    if (url.pathname === '/api/models') {
      return handleModelsAPI(corsHeaders);
    }
    
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200, headers: corsHeaders });
    }
    
    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};

// ========== API HANDLERS ==========

async function handleChatAPI(request, env, corsHeaders) {
  try {
    const { message, model } = await request.json();
    
    // Get AI response from 9router
    const response = await fetch(env.OPENAI_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': 'Bearer ' + env.OPENAI_API_KEY 
      },
      body: JSON.stringify({
        model: model || 'gemini/gemini-3.5-flash-lite',
        messages: [{ role: 'user', content: message }],
        max_tokens: 2048,
        temperature: 0.7,
        stream: false
      })
    });
    
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch(e) {
      // Handle SSE response
      const lines = raw.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
          try { data = JSON.parse(line.slice(6)); break; } catch(e2) {}
        }
      }
      if (!data) data = { error: raw.substring(0, 200) };
    }
    
    const reply = data.choices?.[0]?.message?.content || 'No response';
    
    return new Response(JSON.stringify({ reply }), { 
      headers: { 'Content-Type': 'application/json', ...corsHeaders } 
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json', ...corsHeaders } 
    });
  }
}

function handleModelsAPI(corsHeaders) {
  const models = [
    { id: 'gemini/gemini-3.5-flash-lite', name: 'Gemini Flash Lite', icon: '⚡', type: 'Fast & Free', category: 'text' },
    { id: 'Xk/qwen/qwen3.8-max', name: 'Qwen 3.8 Max', icon: '🧠', type: 'Smart Reasoning', category: 'text' },
    { id: 'Xk/deepseek/deepseek-v4-flash', name: 'DeepSeek V4', icon: '💻', type: 'Code Expert', category: 'code' },
    { id: 'Xk/xiaomi/mimo-v2.5:free', name: 'MiMo V2.5', icon: '🤖', type: 'Free Model', category: 'text' },
    { id: 'gemini/gemma-4-31b-it', name: 'Gemma 4 31B', icon: '💎', type: 'Google Model', category: 'text' },
    { id: 'flux', name: 'Flux Image', icon: '🎨', type: 'Image Generation', category: 'image' },
    { id: 'flux-realism', name: 'Flux Realistic', icon: '📸', type: 'Realistic Photos', category: 'image' },
    { id: 'flux-anime', name: 'Flux Anime', icon: '🎌', type: 'Anime Style', category: 'image' },
  ];
  
  return new Response(JSON.stringify({ models }), { 
    headers: { 'Content-Type': 'application/json', ...corsHeaders } 
  });
}

// ========== HTML CONTENT ==========

function getIndexHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Hermes AI Hub</title>
  <script src="https://telegram.org/js/telegram-web-app.js"><\/script>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div id="app" class="app">
    <header class="header">
      <div class="header-content">
        <div class="logo">
          <span class="logo-icon">✨</span>
          <span class="logo-text">Hermes AI</span>
        </div>
        <button class="settings-btn" onclick="openSettings()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
        </button>
      </div>
    </header>

    <div class="model-selector" onclick="toggleModelDrawer()">
      <div class="model-info">
        <span class="model-icon" id="currentModelIcon">🤖</span>
        <div class="model-details">
          <span class="model-name" id="currentModelName">Gemini Flash</span>
          <span class="model-type" id="currentModelType">Fast & Smart</span>
        </div>
      </div>
      <svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6,9 12,15 18,9"/>
      </svg>
    </div>

    <div class="chat-container" id="chatContainer">
      <div class="welcome-message" id="welcomeMessage">
        <div class="welcome-icon">🌟</div>
        <h2>Welcome to Hermes AI</h2>
        <p>Your intelligent assistant powered by multiple AI models</p>
      </div>
      <div class="messages" id="messages"></div>
    </div>

    <div class="image-panel" id="imagePanel" style="display: none;">
      <div class="image-panel-header">
        <h3>Generate Image</h3>
        <button class="close-btn" onclick="closeImagePanel()">×</button>
      </div>
      <div class="aspect-ratio-selector">
        <button class="aspect-btn active" data-ratio="1:1" onclick="selectAspect(this)">1:1</button>
        <button class="aspect-btn" data-ratio="16:9" onclick="selectAspect(this)">16:9</button>
        <button class="aspect-btn" data-ratio="9:16" onclick="selectAspect(this)">9:16</button>
        <button class="aspect-btn" data-ratio="4:3" onclick="selectAspect(this)">4:3</button>
      </div>
      <button class="generate-btn" id="generateBtn" onclick="generateImage()">
        <span class="btn-text">✨ Generate</span>
        <div class="shimmer" id="shimmer" style="display: none;"></div>
      </button>
    </div>

    <div class="input-area">
      <div class="input-wrapper">
        <textarea id="messageInput" placeholder="Ask anything..." rows="1" onkeydown="handleKeyDown(event)" oninput="autoResize(this)"></textarea>
        <button class="attach-btn" onclick="toggleImagePanel()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
        </button>
        <button class="send-btn" onclick="sendMessage()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22,2 15,22 11,13 2,9"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="drawer-overlay" id="modelDrawer" onclick="closeModelDrawer(event)">
      <div class="drawer" onclick="event.stopPropagation()">
        <div class="drawer-header">
          <h3>Select AI Model</h3>
          <button class="close-btn" onclick="closeModelDrawer()">×</button>
        </div>
        <div class="model-list" id="modelList"></div>
      </div>
    </div>

    <div class="modal-overlay" id="settingsModal" onclick="closeSettings(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>Settings</h3>
          <button class="close-btn" onclick="closeSettings()">×</button>
        </div>
        <div class="settings-content">
          <div class="setting-item">
            <span>Dark Mode</span>
            <label class="switch">
              <input type="checkbox" checked disabled>
              <span class="slider"></span>
            </label>
          </div>
          <div class="setting-item">
            <span>Notifications</span>
            <label class="switch">
              <input type="checkbox" id="notificationsToggle">
              <span class="slider"></span>
            </label>
          </div>
          <button class="action-btn danger" onclick="clearHistory()">🗑️ Clear Chat History</button>
        </div>
      </div>
    </div>
  </div>
  <script src="/app.js"><\/script>
</body>
</html>`;
}

function getStyleCSS() {
  return `/* Hermes AI Hub - Luxury Dark & Gold Theme */

:root {
  --bg-deep: #0b0b0b;
  --bg-dark: #121212;
  --bg-card: rgba(18, 18, 18, 0.8);
  --bg-glass: rgba(255, 255, 255, 0.05);
  --gold-primary: #FFD700;
  --gold-secondary: #D4AF37;
  --gold-dark: #AA771C;
  --gold-gradient: linear-gradient(135deg, #FFD700 0%, #D4AF37 50%, #AA771C 100%);
  --text-primary: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.7);
  --text-muted: rgba(255, 255, 255, 0.4);
  --border-glass: rgba(255, 255, 255, 0.1);
  --shadow-gold: 0 0 20px rgba(255, 215, 0, 0.2);
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-deep);
  color: var(--text-primary);
  overflow: hidden;
  height: 100vh;
  height: 100dvh;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  max-width: 480px;
  margin: 0 auto;
  position: relative;
}

.header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: linear-gradient(180deg, var(--bg-dark) 0%, rgba(18, 18, 18, 0.95) 100%);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-glass);
  padding: calc(var(--safe-top) + 12px) 16px 12px;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo { display: flex; align-items: center; gap: 8px; }
.logo-icon { font-size: 24px; }
.logo-text {
  font-size: 20px;
  font-weight: 700;
  background: var(--gold-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.settings-btn {
  background: var(--bg-glass);
  border: 1px solid var(--border-glass);
  border-radius: 12px;
  padding: 8px;
  color: var(--text-secondary);
  cursor: pointer;
}

.model-selector {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin: 8px 16px;
  background: var(--bg-glass);
  border: 1px solid var(--border-glass);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.model-selector:hover {
  border-color: var(--gold-primary);
  box-shadow: var(--shadow-gold);
}

.model-info { display: flex; align-items: center; gap: 12px; }
.model-icon { font-size: 28px; }
.model-details { display: flex; flex-direction: column; }
.model-name { font-size: 16px; font-weight: 600; }
.model-type { font-size: 12px; color: var(--text-muted); }
.chevron { color: var(--text-muted); }

.chat-container { flex: 1; overflow-y: auto; padding: 16px; }

.welcome-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
}

.welcome-icon { font-size: 64px; margin-bottom: 16px; }

.welcome-message h2 {
  font-size: 24px;
  font-weight: 700;
  background: var(--gold-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 8px;
}

.messages { display: flex; flex-direction: column; gap: 12px; }

.message {
  max-width: 85%;
  padding: 12px 16px;
  border-radius: 18px;
  font-size: 15px;
  line-height: 1.5;
  word-wrap: break-word;
}

.message.user {
  align-self: flex-end;
  background: linear-gradient(135deg, var(--gold-dark) 0%, #8B6914 100%);
  border-bottom-right-radius: 4px;
}

.message.assistant {
  align-self: flex-start;
  background: var(--bg-glass);
  border: 1px solid var(--border-glass);
  border-bottom-left-radius: 4px;
}

.message.image { padding: 8px; max-width: 300px; }
.message.image img { width: 100%; border-radius: 12px; }

.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  background: var(--bg-glass);
  border: 1px solid var(--border-glass);
  border-radius: 18px;
  align-self: flex-start;
  max-width: 80px;
}

.typing-dot {
  width: 8px;
  height: 8px;
  background: var(--gold-primary);
  border-radius: 50%;
  animation: typingBounce 1.4s infinite ease-in-out;
}

@keyframes typingBounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.image-panel {
  padding: 16px;
  margin: 0 16px;
  background: var(--bg-glass);
  border: 1px solid var(--border-glass);
  border-radius: 16px;
}

.aspect-ratio-selector { display: flex; gap: 8px; margin-bottom: 16px; }

.aspect-btn {
  flex: 1;
  padding: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-glass);
  border-radius: 12px;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.aspect-btn.active {
  background: var(--gold-gradient);
  color: var(--bg-deep);
}

.generate-btn {
  width: 100%;
  padding: 14px;
  background: var(--gold-gradient);
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  color: var(--bg-deep);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.shimmer {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer { 0% { left: -100%; } 100% { left: 100%; } }

.input-area {
  padding: 12px 16px calc(var(--safe-bottom) + 12px);
  background: linear-gradient(0deg, var(--bg-dark) 0%, rgba(18, 18, 18, 0.95) 100%);
  border-top: 1px solid var(--border-glass);
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--bg-glass);
  border: 1px solid var(--border-glass);
  border-radius: 24px;
  padding: 8px 12px;
}

textarea {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 15px;
  resize: none;
  max-height: 120px;
  font-family: inherit;
}

.attach-btn, .send-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 8px;
}

.send-btn {
  background: var(--gold-gradient);
  color: var(--bg-deep);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 1000;
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s ease;
}

.drawer-overlay.active { opacity: 1; visibility: visible; }

.drawer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  max-width: 480px;
  margin: 0 auto;
  background: var(--bg-dark);
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  padding: 24px 16px;
  transform: translateY(100%);
  transition: transform 0.3s ease;
  max-height: 70vh;
  overflow-y: auto;
}

.drawer-overlay.active .drawer { transform: translateY(0); }

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.drawer-header h3 {
  font-size: 20px;
  background: var(--gold-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.model-list { display: flex; flex-direction: column; gap: 8px; }

.model-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--bg-glass);
  border: 1px solid var(--border-glass);
  border-radius: 16px;
  cursor: pointer;
}

.model-item.active {
  background: rgba(255, 215, 0, 0.1);
  border-color: var(--gold-primary);
}

.model-item-icon { font-size: 32px; width: 48px; text-align: center; }
.model-item-info { flex: 1; }
.model-item-name { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
.model-item-desc { font-size: 12px; color: var(--text-secondary); }
.model-item-check { color: var(--gold-primary); font-size: 20px; opacity: 0; }
.model-item.active .model-item-check { opacity: 1; }

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 1000;
  opacity: 0;
  visibility: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-overlay.active { opacity: 1; visibility: visible; }

.modal {
  background: var(--bg-dark);
  border-radius: 24px;
  padding: 24px;
  width: 90%;
  max-width: 380px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.modal-header h3 {
  font-size: 20px;
  background: var(--gold-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-glass);
}

.switch { position: relative; display: inline-block; width: 48px; height: 28px; }
.switch input { opacity: 0; width: 0; height: 0; }

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-glass);
  border-radius: 28px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 22px;
  width: 22px;
  left: 2px;
  bottom: 2px;
  background-color: var(--text-secondary);
  border-radius: 50%;
}

input:checked + .slider { background: var(--gold-gradient); }
input:checked + .slider:before { transform: translateX(20px); background-color: var(--bg-deep); }

.action-btn.danger {
  padding: 14px;
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 12px;
  width: 100%;
  cursor: pointer;
  margin-top: 16px;
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 24px;
  cursor: pointer;
}`;
}

function getAppJS() {
  return `// Hermes AI Hub - Main App Logic
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const CONFIG = {
  models: [
    { id: 'gemini/gemini-3.5-flash-lite', name: 'Gemini Flash Lite', icon: '⚡', type: 'Fast & Free', category: 'text' },
    { id: 'Xk/qwen/qwen3.8-max', name: 'Qwen 3.8 Max', icon: '🧠', type: 'Smart Reasoning', category: 'text' },
    { id: 'Xk/deepseek/deepseek-v4-flash', name: 'DeepSeek V4', icon: '💻', type: 'Code Expert', category: 'code' },
    { id: 'Xk/xiaomi/mimo-v2.5:free', name: 'MiMo V2.5', icon: '🤖', type: 'Free Model', category: 'text' },
    { id: 'gemini/gemma-4-31b-it', name: 'Gemma 4 31B', icon: '💎', type: 'Google Model', category: 'text' },
    { id: 'flux', name: 'Flux Image', icon: '🎨', type: 'Image Generation', category: 'image' },
    { id: 'flux-realism', name: 'Flux Realistic', icon: '📸', type: 'Realistic Photos', category: 'image' },
    { id: 'flux-anime', name: 'Flux Anime', icon: '🎌', type: 'Anime Style', category: 'image' },
  ],
  defaultModel: 'gemini/gemini-3.5-flash-lite',
  imageEndpoint: 'https://image.pollinations.ai/prompt/',
};

let state = { currentModel: CONFIG.defaultModel, messages: [], isTyping: false, imageRatio: '1:1' };

const el = {
  chatContainer: document.getElementById('chatContainer'),
  messages: document.getElementById('messages'),
  input: document.getElementById('messageInput'),
  modelIcon: document.getElementById('currentModelIcon'),
  modelName: document.getElementById('currentModelName'),
  modelType: document.getElementById('currentModelType'),
  modelList: document.getElementById('modelList'),
  modelDrawer: document.getElementById('modelDrawer'),
  settingsModal: document.getElementById('settingsModal'),
  imagePanel: document.getElementById('imagePanel'),
  welcome: document.getElementById('welcomeMessage'),
};

function init() { loadModels(); loadHistory(); updateModel(); el.input.focus(); }

function loadModels() {
  el.modelList.innerHTML = '';
  const groups = { text: 'Chat Models', image: 'Image Models' };
  for (const [cat, label] of Object.entries(groups)) {
    const models = CONFIG.models.filter(m => m.category === cat || (cat === 'text' && m.category === 'code'));
    if (models.length === 0) continue;
    const h = document.createElement('div');
    h.style.cssText = 'color:var(--text-muted);font-size:12px;text-transform:uppercase;padding:8px 16px;letter-spacing:1px;';
    h.textContent = label;
    el.modelList.appendChild(h);
    models.forEach(m => {
      const item = document.createElement('div');
      item.className = 'model-item' + (m.id === state.currentModel ? ' active' : '');
      item.onclick = () => selectModel(m.id);
      item.innerHTML = '<div class="model-item-icon">' + m.icon + '</div><div class="model-item-info"><div class="model-item-name">' + m.name + '</div><div class="model-item-desc">' + m.type + '</div></div><div class="model-item-check">✓</div>';
      el.modelList.appendChild(item);
    });
  }
}

function selectModel(id) {
  state.currentModel = id;
  updateModel();
  closeModelDrawer();
  const m = CONFIG.models.find(x => x.id === id);
  el.imagePanel.style.display = m && m.category === 'image' ? 'block' : 'none';
  localStorage.setItem('model', id);
}

function updateModel() {
  const m = CONFIG.models.find(x => x.id === state.currentModel);
  if (m) { el.modelIcon.textContent = m.icon; el.modelName.textContent = m.name; el.modelType.textContent = m.type; }
}

function toggleModelDrawer() { el.modelDrawer.classList.toggle('active'); }
function closeModelDrawer(e) { if (!e || e.target === el.modelDrawer) el.modelDrawer.classList.remove('active'); }

async function sendMessage() {
  const text = el.input.value.trim();
  if (!text || state.isTyping) return;
  el.input.value = '';
  el.input.style.height = 'auto';
  if (el.welcome) el.welcome.style.display = 'none';
  addMsg('user', text);
  state.isTyping = true;
  const typing = addTyping();
  try {
    const reply = await callAI(text);
    removeTyping(typing);
    addMsg('assistant', reply);
  } catch (e) {
    removeTyping(typing);
    addMsg('assistant', '❌ Error: ' + e.message);
  }
  state.isTyping = false;
}

async function callAI(text) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, model: state.currentModel })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.reply;
}

function addMsg(role, content) {
  const div = document.createElement('div');
  div.className = 'message ' + role;
  div.innerHTML = role === 'assistant' ? '<span style="margin-right:4px">✨</span>' + fmt(content) : esc(content);
  el.messages.appendChild(div);
  state.messages.push({ role, content, ts: Date.now() });
  saveHistory();
  scroll();
}

function addTyping() {
  const div = document.createElement('div');
  div.className = 'typing-indicator';
  div.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  el.messages.appendChild(div);
  scroll();
  return div;
}

function removeTyping(e) { if (e?.parentNode) e.parentNode.removeChild(e); }

function fmt(t) { return t.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>').replace(/\\*(.*?)\\*/g, '<em>$1</em>').replace(/\\n/g, '<br>'); }
function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function scroll() { setTimeout(() => el.chatContainer.scrollTop = el.chatContainer.scrollHeight, 50); }

function selectAspect(btn) {
  document.querySelectorAll('.aspect-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.imageRatio = btn.dataset.ratio;
}

async function generateImage() {
  const prompt = el.input.value.trim();
  if (!prompt) return alert('Enter a description');
  const [w, h] = state.imageRatio.split(':').map(Number);
  const s = 1024;
  const url = CONFIG.imageEndpoint + encodeURIComponent(prompt) + '?width=' + (w >= h ? s : Math.round(s * w / h)) + '&height=' + (h >= w ? s : Math.round(s * h / w)) + '&nologo=true&model=' + state.currentModel + '&seed=' + Math.floor(Math.random() * 999999);
  const div = document.createElement('div');
  div.className = 'message image assistant';
  div.innerHTML = '<img src="' + url + '" style="width:100%;border-radius:12px"><div style="padding:8px 4px;font-size:12px;color:var(--text-secondary)">' + esc(prompt) + '</div>';
  el.messages.appendChild(div);
  el.input.value = '';
  scroll();
}

function toggleImagePanel() {
  const m = CONFIG.models.find(x => x.id === state.currentModel);
  if (m && m.category === 'image') { el.imagePanel.style.display = el.imagePanel.style.display === 'none' ? 'block' : 'none'; }
  else { const im = CONFIG.models.find(x => x.category === 'image'); if (im) selectModel(im.id); }
}

function closeImagePanel() { el.imagePanel.style.display = 'none'; }
function openSettings() { el.settingsModal.classList.add('active'); }
function closeSettings(e) { if (!e || e.target === el.settingsModal) el.settingsModal.classList.remove('active'); }

function clearHistory() {
  if (confirm('Clear all history?')) {
    state.messages = [];
    el.messages.innerHTML = '';
    localStorage.removeItem('history');
    if (el.welcome) el.welcome.style.display = 'flex';
    closeSettings();
  }
}

function saveHistory() { localStorage.setItem('history', JSON.stringify(state.messages.slice(-50))); }

function loadHistory() {
  const s = localStorage.getItem('history');
  if (s) {
    try {
      state.messages = JSON.parse(s);
      state.messages.forEach(m => addMsg(m.role, m.content));
      if (state.messages.length > 0 && el.welcome) el.welcome.style.display = 'none';
    } catch (e) {}
  }
  const m = localStorage.getItem('model');
  if (m) state.currentModel = m;
}

function handleKeyDown(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function autoResize(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }

document.addEventListener('DOMContentLoaded', init);`;
}
