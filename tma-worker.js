// Hermes AI Hub - Telegram Mini App (Full Featured)
// Deploy as Cloudflare Worker

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (url.pathname === '/' || url.pathname === '/index.html') return new Response(getHTML(), { headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } });
    if (url.pathname === '/api/chat' && request.method === 'POST') return handleChat(request, env, corsHeaders);
    if (url.pathname === '/api/models') return handleModels(corsHeaders);
    if (url.pathname === '/health') return new Response('OK', { headers: corsHeaders });
    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};

async function handleChat(request, env, corsHeaders) {
  try {
    const { message, model, personality } = await request.json();
    const apiBase = 'https://9router-production-d4c69.up.railway.app/v1';
    const apiKey = 'sk-957828c121e13776-aklyc5-7da3a2f9';
    const systemPrompt = getPersonalityPrompt(personality || 'default');
    const response = await fetch(apiBase + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: model || 'gemini/gemini-3.5-flash-lite',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }],
        max_tokens: 2048, temperature: 0.7, stream: false
      })
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch(e) {
      const lines = raw.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
          try { data = JSON.parse(line.slice(6)); break; } catch(e2) {}
        }
      }
      if (!data) data = { error: raw.substring(0, 200) };
    }
    const reply = data.choices?.[0]?.message?.content || 'No response';
    return new Response(JSON.stringify({ reply }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

function handleModels(corsHeaders) {
  const models = [
    { id: 'gemini/gemini-3.5-flash-lite', name: 'Gemini Flash Lite', icon: '\u26A1', type: 'Fast & Free', category: 'text' },
    { id: 'Xk/qwen/qwen3.8-max', name: 'Qwen 3.8 Max', icon: '\uD83E\uDDE0', type: 'Smart Reasoning', category: 'text' },
    { id: 'Xk/deepseek/deepseek-v4-flash', name: 'DeepSeek V4', icon: '\uD83D\uDCBB', type: 'Code Expert', category: 'code' },
    { id: 'Xk/xiaomi/mimo-v2.5:free', name: 'MiMo V2.5', icon: '\uD83E\uDD16', type: 'Free Model', category: 'text' },
    { id: 'gemini/gemma-4-31b-it', name: 'Gemma 4 31B', icon: '\uD83D\uDC8E', type: 'Google Model', category: 'text' },
    { id: 'flux', name: 'Flux Image', icon: '\uD83C\uDFA8', type: 'Image Gen', category: 'image' },
    { id: 'flux-realism', name: 'Flux Realistic', icon: '\uD83D\uDCF8', type: 'Realistic', category: 'image' },
    { id: 'flux-anime', name: 'Flux Anime', icon: '\uD83C\uDF8C', type: 'Anime', category: 'image' },
  ];
  return new Response(JSON.stringify({ models }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

function getPersonalityPrompt(p) {
  const prompts = {
    default: 'You are Hermes, a helpful AI assistant created by iprez. Be concise, friendly, and helpful. Reply in the same language the user writes in.',
    shoj: 'You are a funny, witty AI. Use humor, jokes, and playful language. Be entertaining but still helpful.',
    jidi: 'You are a serious, professional AI. Be formal, precise, and thorough. Focus on accuracy.',
    filasafi: 'You are a philosophical AI. Think deeply, ask thought-provoking questions, and explore ideas from multiple angles.',
    moalem: 'You are a patient teacher AI. Explain things step by step, use examples, and encourage learning.',
    barnameh: 'You are an expert programmer AI. Write clean code, explain algorithms, and help debug issues. Always provide code examples.',
  };
  return prompts[p] || prompts.default;
}

function getHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>Hermes AI Hub</title>
<script src="https://telegram.org/js/telegram-web-app.js"><\/script>
<style>
:root{--bg:#0b0b0b;--bg2:#121212;--bg3:rgba(18,18,18,.8);--glass:rgba(255,255,255,.05);--gold:#FFD700;--gold2:#D4AF37;--gold3:#AA771C;--grad:linear-gradient(135deg,#FFD700,#D4AF37,#AA771C);--txt:#fff;--txt2:rgba(255,255,255,.7);--txt3:rgba(255,255,255,.4);--brd:rgba(255,255,255,.1);--sh:0 0 20px rgba(255,215,0,.2);--safe-t:env(safe-area-inset-top,0px);--safe-b:env(safe-area-inset-bottom,0px);--fs:15px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--txt);overflow:hidden;height:100vh;height:100dvh}
.app{display:flex;flex-direction:column;height:100vh;height:100dvh;max-width:480px;margin:0 auto;position:relative}
.header{position:sticky;top:0;z-index:100;background:linear-gradient(180deg,var(--bg2),rgba(18,18,18,.95));backdrop-filter:blur(20px);border-bottom:1px solid var(--brd);padding:calc(var(--safe-t) + 8px) 12px 8px}
.hdr-row{display:flex;align-items:center;justify-content:space-between}
.logo{display:flex;align-items:center;gap:6px}
.logo-icon{font-size:20px}
.logo-text{font-size:18px;font-weight:700;background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hdr-btns{display:flex;gap:6px}
.hdr-btn{background:var(--glass);border:1px solid var(--brd);border-radius:10px;padding:6px 10px;color:var(--txt2);cursor:pointer;font-size:12px;transition:.2s}
.hdr-btn:hover{color:var(--gold);border-color:var(--gold)}
.tabs{display:flex;gap:4px;padding:8px 0 0;overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;background:var(--glass);border:1px solid var(--brd);color:var(--txt2);transition:.2s}
.tab.active{background:var(--grad);color:var(--bg);border-color:var(--gold)}
.model-bar{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;margin:6px 12px;background:var(--glass);border:1px solid var(--brd);border-radius:14px;cursor:pointer;transition:.3s}
.model-bar:hover{border-color:var(--gold);box-shadow:var(--sh)}
.model-info{display:flex;align-items:center;gap:10px}
.model-icon{font-size:24px}
.model-name{font-size:14px;font-weight:600}
.model-type{font-size:11px;color:var(--txt3)}
.chev{color:var(--txt3);font-size:14px}
.chat-wrap{flex:1;overflow-y:auto;padding:12px;scroll-behavior:smooth}
.chat-wrap::-webkit-scrollbar{width:3px}
.chat-wrap::-webkit-scrollbar-thumb{background:var(--brd);border-radius:2px}
.welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center}
.welcome-icon{font-size:56px;margin-bottom:12px;animation:float 3s ease-in-out infinite}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.welcome h2{font-size:22px;background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:6px}
.welcome p{font-size:13px;color:var(--txt2);max-width:260px}
.msgs{display:flex;flex-direction:column;gap:10px}
.msg{max-width:85%;padding:10px 14px;border-radius:16px;font-size:var(--fs);line-height:1.5;word-wrap:break-word;animation:msgIn .3s ease;position:relative}
@keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.msg.user{align-self:flex-end;background:linear-gradient(135deg,var(--gold3),#8B6914);border-bottom-right-radius:4px}
.msg.ai{align-self:flex-start;background:var(--glass);border:1px solid var(--brd);border-bottom-left-radius:4px}
.msg .ai-tag{font-size:11px;color:var(--gold);margin-bottom:4px;display:block}
.msg pre{background:rgba(0,0,0,.3);border:1px solid var(--brd);border-radius:8px;padding:10px;overflow-x:auto;margin:8px 0;font-size:13px;font-family:'SF Mono',Menlo,monospace}
.msg code{background:rgba(255,215,0,.1);padding:1px 4px;border-radius:4px;font-family:'SF Mono',Menlo,monospace;font-size:13px}
.msg pre code{background:none;padding:0}
.msg-actions{display:flex;gap:4px;margin-top:6px;opacity:0;transition:.2s}
.msg:hover .msg-actions{opacity:1}
.msg-btn{background:var(--glass);border:1px solid var(--brd);border-radius:6px;padding:3px 8px;color:var(--txt3);cursor:pointer;font-size:11px;transition:.2s}
.msg-btn:hover{color:var(--gold);border-color:var(--gold)}
.msg-btn.starred{color:var(--gold);border-color:var(--gold)}
.msg-img{padding:6px;max-width:280px}
.msg-img img{width:100%;border-radius:10px;display:block;cursor:pointer}
.msg-img .caption{padding:6px 4px 2px;font-size:12px;color:var(--txt2)}
.typing{display:flex;align-items:center;gap:4px;padding:10px 14px;background:var(--glass);border:1px solid var(--brd);border-radius:16px;align-self:flex-start;max-width:70px}
.typing-dot{width:7px;height:7px;background:var(--gold);border-radius:50%;animation:bounce 1.4s infinite ease-in-out}
.typing-dot:nth-child(1){animation-delay:0s}
.typing-dot:nth-child(2){animation-delay:.2s}
.typing-dot:nth-child(3){animation-delay:.4s}
@keyframes bounce{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}
.img-panel{padding:12px;margin:0 12px;background:var(--glass);border:1px solid var(--brd);border-radius:14px;animation:slideUp .3s ease}
@keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.img-panel h3{font-size:14px;color:var(--gold);margin-bottom:10px}
.ratio-btns{display:flex;gap:6px;margin-bottom:10px}
.ratio-btn{flex:1;padding:8px;background:var(--bg3);border:1px solid var(--brd);border-radius:10px;color:var(--txt2);font-size:13px;font-weight:600;cursor:pointer;text-align:center}
.ratio-btn.active{background:var(--grad);color:var(--bg);border-color:var(--gold)}
.style-btns{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.style-btn{padding:6px 12px;background:var(--bg3);border:1px solid var(--brd);border-radius:8px;color:var(--txt2);font-size:12px;cursor:pointer}
.style-btn.active{background:rgba(255,215,0,.15);color:var(--gold);border-color:var(--gold)}
.gen-btn{width:100%;padding:12px;background:var(--grad);border:none;border-radius:10px;font-size:15px;font-weight:700;color:var(--bg);cursor:pointer;position:relative;overflow:hidden}
.gen-btn:active{transform:scale(.98)}
.shimmer{position:absolute;top:0;left:-100%;width:100%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);animation:shimmer 1.5s infinite}
@keyframes shimmer{0%{left:-100%}100%{left:100%}}
.gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:8px 0}
.gallery-item{border-radius:10px;overflow:hidden;cursor:pointer;border:1px solid var(--brd)}
.gallery-item img{width:100%;height:120px;object-fit:cover;display:block}
.input-area{padding:10px 12px calc(var(--safe-b) + 10px);background:linear-gradient(0deg,var(--bg2),rgba(18,18,18,.95));border-top:1px solid var(--brd)}
.input-row{display:flex;align-items:flex-end;gap:6px;background:var(--glass);border:1px solid var(--brd);border-radius:22px;padding:6px 10px}
.input-row:focus-within{border-color:var(--gold);box-shadow:0 0 0 2px rgba(255,215,0,.1)}
textarea{flex:1;background:transparent;border:none;outline:none;color:var(--txt);font-size:var(--fs);line-height:1.4;resize:none;max-height:100px;font-family:inherit}
textarea::placeholder{color:var(--txt3)}
.icon-btn{background:none;border:none;color:var(--txt3);cursor:pointer;padding:6px;transition:.2s;font-size:18px}
.icon-btn:hover{color:var(--gold)}
.send-btn{background:var(--grad);color:var(--bg);border:none;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;flex-shrink:0}
.send-btn:active{transform:scale(.95)}
.overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:1000;opacity:0;visibility:hidden;transition:.3s}
.overlay.active{opacity:1;visibility:visible}
.drawer{position:absolute;bottom:0;left:0;right:0;max-width:480px;margin:0 auto;background:var(--bg2);border-top-left-radius:20px;border-top-right-radius:20px;padding:20px 14px calc(var(--safe-b) + 20px);transform:translateY(100%);transition:.3s;max-height:75vh;overflow-y:auto}
.overlay.active .drawer{transform:translateY(0)}
.drawer-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.drawer-hdr h3{font-size:18px;background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.close{background:none;border:none;color:var(--txt3);font-size:22px;cursor:pointer;padding:4px 8px}
.mdl-item{display:flex;align-items:center;gap:12px;padding:12px;background:var(--glass);border:1px solid var(--brd);border-radius:14px;cursor:pointer;margin-bottom:6px;transition:.2s}
.mdl-item:hover{border-color:var(--gold)}
.mdl-item.active{background:rgba(255,215,0,.1);border-color:var(--gold);box-shadow:var(--sh)}
.mdl-icon{font-size:28px;width:40px;text-align:center}
.mdl-info{flex:1}
.mdl-name{font-size:14px;font-weight:600}
.mdl-desc{font-size:11px;color:var(--txt2)}
.mdl-check{color:var(--gold);font-size:18px;opacity:0}
.mdl-item.active .mdl-check{opacity:1}
.section-label{color:var(--txt3);font-size:11px;text-transform:uppercase;letter-spacing:1px;padding:8px 0 4px}
.modal{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(.9);background:var(--bg2);border-radius:20px;padding:20px;width:90%;max-width:380px;max-height:80vh;overflow-y:auto;transition:.3s}
.overlay.active .modal{transform:translate(-50%,-50%) scale(1)}
.modal-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.modal-hdr h3{font-size:18px;background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.setting{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--brd)}
.setting span{font-size:14px}
.toggle{position:relative;width:44px;height:26px}
.toggle input{opacity:0;width:0;height:0}
.toggle .slider{position:absolute;top:0;left:0;right:0;bottom:0;background:var(--glass);border-radius:26px;cursor:pointer;transition:.3s;border:1px solid var(--brd)}
.toggle .slider:before{content:"";position:absolute;height:20px;width:20px;left:2px;bottom:2px;background:var(--txt2);border-radius:50%;transition:.3s}
.toggle input:checked+.slider{background:var(--grad);border-color:var(--gold)}
.toggle input:checked+.slider:before{transform:translateX(18px);background:var(--bg)}
.personality-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:8px 0}
.personality-card{padding:12px;background:var(--glass);border:1px solid var(--brd);border-radius:12px;cursor:pointer;text-align:center;transition:.2s}
.personality-card:hover{border-color:var(--gold)}
.personality-card.active{background:rgba(255,215,0,.1);border-color:var(--gold);box-shadow:var(--sh)}
.personality-card .p-icon{font-size:28px;margin-bottom:4px}
.personality-card .p-name{font-size:13px;font-weight:600}
.personality-card .p-desc{font-size:10px;color:var(--txt3)}
.theme-grid{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.theme-btn{padding:8px 16px;border-radius:10px;font-size:13px;cursor:pointer;border:1px solid var(--brd);background:var(--glass);color:var(--txt2)}
.theme-btn.active{border-color:var(--gold);color:var(--gold)}
.action-btn{width:100%;padding:12px;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;transition:.2s}
.action-btn.primary{background:var(--grad);color:var(--bg)}
.action-btn.danger{background:rgba(239,68,68,.2);color:#ef4444;border:1px solid rgba(239,68,68,.3)}
.action-btn.secondary{background:var(--glass);color:var(--txt2);border:1px solid var(--brd)}
.search-bar{display:flex;gap:8px;padding:8px 0}
.search-bar input{flex:1;background:var(--glass);border:1px solid var(--brd);border-radius:10px;padding:8px 12px;color:var(--txt);font-size:14px;outline:none}
.search-bar input:focus{border-color:var(--gold)}
.game-area{text-align:center;padding:16px}
.game-title{font-size:18px;color:var(--gold);margin-bottom:12px}
.game-input{background:var(--glass);border:1px solid var(--brd);border-radius:10px;padding:10px;color:var(--txt);font-size:16px;text-align:center;width:200px;outline:none}
.game-btn{margin-top:10px;padding:10px 24px;background:var(--grad);color:var(--bg);border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}
.calc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:8px 0}
.calc-btn{padding:14px;background:var(--glass);border:1px solid var(--brd);border-radius:10px;color:var(--txt);font-size:18px;cursor:pointer;text-align:center}
.calc-btn.op{color:var(--gold)}
.calc-btn.eq{background:var(--grad);color:var(--bg)}
.calc-display{background:var(--glass);border:1px solid var(--brd);border-radius:10px;padding:14px;font-size:24px;text-align:right;margin-bottom:8px;min-height:50px;word-break:break-all}
.level-bar{display:flex;align-items:center;gap:8px;margin:8px 0}
.level-bar .bar{flex:1;height:8px;background:var(--glass);border-radius:4px;overflow:hidden}
.level-bar .bar-fill{height:100%;background:var(--grad);border-radius:4px;transition:.5s}
.level-bar .level-text{font-size:12px;color:var(--gold);font-weight:700;min-width:50px}
.hidden{display:none!important}
@media(max-width:480px){.app{max-width:100%}}
</style>
</head>
<body>
<div class="app">
  <header class="header">
    <div class="hdr-row">
      <div class="logo"><span class="logo-icon">\u2728</span><span class="logo-text">Hermes AI</span></div>
      <div class="hdr-btns">
        <button class="hdr-btn" onclick="openPanel('search')">Search</button>
        <button class="hdr-btn" onclick="openPanel('settings')">Settings</button>
      </div>
    </div>
    <div class="tabs">
      <div class="tab active" data-tab="chat" onclick="switchTab(this)">Chat</div>
      <div class="tab" data-tab="image" onclick="switchTab(this)">Image</div>
      <div class="tab" data-tab="gallery" onclick="switchTab(this)">Gallery</div>
      <div class="tab" data-tab="tools" onclick="switchTab(this)">Tools</div>
      <div class="tab" data-tab="games" onclick="switchTab(this)">Games</div>
    </div>
  </header>

  <div class="model-bar" onclick="openPanel('models')">
    <div class="model-info">
      <span class="model-icon" id="mIcon">\u26A1</span>
      <div><div class="model-name" id="mName">Gemini Flash</div><div class="model-type" id="mType">Fast & Free</div></div>
    </div>
    <span class="chev">\u25BC</span>
  </div>

  <!-- CHAT TAB -->
  <div class="chat-wrap" id="chatTab">
    <div class="welcome" id="welcome">
      <div class="welcome-icon">\uD83C\uDF1F</div>
      <h2>Welcome to Hermes AI</h2>
      <p>Multiple AI models, image generation, tools & games</p>
    </div>
    <div class="msgs" id="msgs"></div>
  </div>

  <!-- IMAGE TAB -->
  <div class="chat-wrap hidden" id="imageTab">
    <div class="img-panel" style="margin:0">
      <h3>\uD83C\uDFA8 Image Generation</h3>
      <div class="section-label">Aspect Ratio</div>
      <div class="ratio-btns">
        <div class="ratio-btn active" data-r="1:1" onclick="selRatio(this)">1:1</div>
        <div class="ratio-btn" data-r="16:9" onclick="selRatio(this)">16:9</div>
        <div class="ratio-btn" data-r="9:16" onclick="selRatio(this)">9:16</div>
        <div class="ratio-btn" data-r="4:3" onclick="selRatio(this)">4:3</div>
      </div>
      <div class="section-label">Style</div>
      <div class="style-btns">
        <div class="style-btn active" data-s="" onclick="selStyle(this)">Default</div>
        <div class="style-btn" data-s=", photorealistic, 8k" onclick="selStyle(this)">Realistic</div>
        <div class="style-btn" data-s=", anime style, vibrant" onclick="selStyle(this)">Anime</div>
        <div class="style-btn" data-s=", oil painting, artistic" onclick="selStyle(this)">Painting</div>
        <div class="style-btn" data-s=", watercolor, soft" onclick="selStyle(this)">Watercolor</div>
        <div class="style-btn" data-s=", pixel art, retro" onclick="selStyle(this)">Pixel Art</div>
        <div class="style-btn" data-s=", 3d render, cinematic" onclick="selStyle(this)">3D</div>
        <div class="style-btn" data-s=", cyberpunk, neon glow" onclick="selStyle(this)">Cyberpunk</div>
      </div>
      <div class="section-label">Custom Size</div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input type="number" id="customW" placeholder="Width" value="1024" style="flex:1;background:var(--glass);border:1px solid var(--brd);border-radius:8px;padding:8px;color:var(--txt);font-size:13px;outline:none">
        <input type="number" id="customH" placeholder="Height" value="1024" style="flex:1;background:var(--glass);border:1px solid var(--brd);border-radius:8px;padding:8px;color:var(--txt);font-size:13px;outline:none">
      </div>
      <textarea id="imgPrompt" placeholder="Describe your image..." rows="3" style="width:100%;background:var(--glass);border:1px solid var(--brd);border-radius:10px;padding:10px;color:var(--txt);font-size:14px;outline:none;resize:none;margin-bottom:10px;font-family:inherit"></textarea>
      <button class="gen-btn" id="genBtn" onclick="generateImage()"><span id="genTxt">\u2728 Generate</span><div class="shimmer hidden" id="genShimmer"></div></button>
      <div id="imgResult" style="margin-top:12px"></div>
    </div>
  </div>

  <!-- GALLERY TAB -->
  <div class="chat-wrap hidden" id="galleryTab">
    <div class="section-label" style="padding:0 0 8px">Generated Images</div>
    <div class="gallery" id="gallery"></div>
    <div id="galleryEmpty" style="text-align:center;color:var(--txt3);padding:40px">No images yet. Generate some!</div>
  </div>

  <!-- TOOLS TAB -->
  <div class="chat-wrap hidden" id="toolsTab">
    <div class="section-label">\uD83E\uDDEE Tools</div>
    <div class="personality-grid" style="margin-bottom:16px">
      <div class="personality-card" onclick="openPanel('calc')"><div class="p-icon">\uD83E\uDDEE</div><div class="p-name">Calculator</div></div>
      <div class="personality-card" onclick="openPanel('translate')"><div class="p-icon">\uD83C\uDF10</div><div class="p-name">Translate</div></div>
      <div class="personality-card" onclick="doTTS()"><div class="p-icon">\uD83C\uDFA4</div><div class="p-name">Text to Speech</div></div>
      <div class="personality-card" onclick="exportChat()"><div class="p-icon">\uD83D\uDCC4</div><div class="p-name">Export PDF</div></div>
      <div class="personality-card" onclick="shareChat()"><div class="p-icon">\uD83D\uDD17</div><div class="p-name">Share Chat</div></div>
      <div class="personality-card" onclick="openPanel('profile')"><div class="p-icon">\uD83D\uDC64</div><div class="p-name">Profile</div></div>
    </div>
  </div>

  <!-- GAMES TAB -->
  <div class="chat-wrap hidden" id="gamesTab">
    <div class="section-label">\uD83C\uDFAE Games</div>
    <div class="personality-grid">
      <div class="personality-card" onclick="startGame('guess')"><div class="p-icon">\uD83C\uDFAF</div><div class="p-name">Guess Number</div><div class="p-desc">1-100</div></div>
      <div class="personality-card" onclick="startGame('word')"><div class="p-icon">\uD83D\uDCDD</div><div class="p-name">Word Game</div><div class="p-desc">AI word challenge</div></div>
      <div class="personality-card" onclick="startGame('story')"><div class="p-icon">\uD83D\uDCD6</div><div class="p-name">Story Builder</div><div class="p-desc">Interactive story</div></div>
      <div class="personality-card" onclick="startGame('trivia')"><div class="p-icon">\u2753</div><div class="p-name">Trivia Quiz</div><div class="p-desc">Test knowledge</div></div>
      <div class="personality-card" onclick="startGame('rps')"><div class="p-icon">\u270A</div><div class="p-name">Rock Paper Scissors</div><div class="p-desc">vs AI</div></div>
      <div class="personality-card" onclick="startGame('math')"><div class="p-icon">\uD83E\uDDEE</div><div class="p-name">Math Challenge</div><div class="p-desc">Speed math</div></div>
    </div>
    <div id="gameArea" style="margin-top:16px"></div>
  </div>

  <!-- INPUT AREA -->
  <div class="input-area" id="inputArea">
    <div class="input-row">
      <textarea id="msgInput" placeholder="Ask anything..." rows="1" onkeydown="onKey(event)" oninput="autoH(this)"></textarea>
      <button class="icon-btn" onclick="startVoice()">\uD83C\uDF99</button>
      <button class="send-btn" onclick="sendMsg()">\u27A4</button>
    </div>
  </div>

  <!-- DRAWERS & MODALS -->
  <div class="overlay" id="drawerOverlay" onclick="closePanel(event)">
    <div class="drawer" id="drawerContent" onclick="event.stopPropagation()"></div>
  </div>
  <div class="overlay" id="modalOverlay" onclick="closeModal(event)">
    <div class="modal" id="modalContent" onclick="event.stopPropagation()"></div>
  </div>
</div>

<script>
const tg=window.Telegram.WebApp;tg.expand();tg.ready();
const API='/api/chat';
const MODELS=[
  {id:'gemini/gemini-3.5-flash-lite',name:'Gemini Flash Lite',icon:'\\u26A1',type:'Fast & Free',cat:'text'},
  {id:'Xk/qwen/qwen3.8-max',name:'Qwen 3.8 Max',icon:'\\uD83E\uDDE0',type:'Smart',cat:'text'},
  {id:'Xk/deepseek/deepseek-v4-flash',name:'DeepSeek V4',icon:'\\uD83D\\uDCBB',type:'Code',cat:'code'},
  {id:'Xk/xiaomi/mimo-v2.5:free',name:'MiMo V2.5',icon:'\\uD83E\\uDD16',type:'Free',cat:'text'},
  {id:'gemini/gemma-4-31b-it',name:'Gemma 4 31B',icon:'\\uD83D\\uDC8E',type:'Google',cat:'text'},
  {id:'flux',name:'Flux Image',icon:'\\uD83C\\uDFA8',type:'Image',cat:'image'},
  {id:'flux-realism',name:'Flux Realistic',icon:'\\uD83D\\uDCF8',type:'Photo',cat:'image'},
  {id:'flux-anime',name:'Flux Anime',icon:'\\uD83C\\uDF8C',type:'Anime',cat:'image'},
];
let S={model:'gemini/gemini-3.5-flash-lite',msgs:[],typing:false,ratio:'1:1',style:'',personality:'default',level:1,xp:0,theme:'dark',fontSize:15,gallery:[],stars:[]};

function init(){loadState();updateModel();renderGallery();document.getElementById('msgInput').focus();}
function loadState(){try{const s=localStorage.getItem('hermes_state');if(s)Object.assign(S,JSON.parse(s));}catch(e){}}
function saveState(){try{localStorage.setItem('hermes_state',JSON.stringify(S));}catch(e){}}

function switchTab(el){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  const tab=el.dataset.tab;
  ['chatTab','imageTab','galleryTab','toolsTab','gamesTab'].forEach(id=>document.getElementById(id).classList.add('hidden'));
  document.getElementById(tab+'Tab').classList.remove('hidden');
  document.getElementById('inputArea').style.display=tab==='chat'?'block':'none';
}

function updateModel(){
  const m=MODELS.find(x=>x.id===S.model);
  if(m){document.getElementById('mIcon').textContent=m.icon;document.getElementById('mName').textContent=m.name;document.getElementById('mType').textContent=m.type;}
}

// === CHAT ===
async function sendMsg(){
  const inp=document.getElementById('msgInput');const text=inp.value.trim();
  if(!text||S.typing)return;inp.value='';inp.style.height='auto';
  document.getElementById('welcome').style.display='none';
  addMsg('user',text);S.typing=true;
  const typing=addTyping();
  try{
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,model:S.model,personality:S.personality})});
    const d=await r.json();removeTyping(typing);
    const reply=d.error?'Error: '+d.error:d.reply;
    addMsg('ai',reply);S.xp+=10;checkLevel();saveState();
  }catch(e){removeTyping(typing);addMsg('ai','Error: '+e.message);}
  S.typing=false;
}

function addMsg(role,content){
  const div=document.createElement('div');div.className='msg '+role;
  const idx=S.msgs.length;
  if(role==='ai'){
    const formatted=formatContent(content);
    div.innerHTML='<span class="ai-tag">Hermes AI</span>'+formatted+
      '<div class="msg-actions">'+
      '<button class="msg-btn" onclick="copyMsg('+idx+')">Copy</button>'+
      '<button class="msg-btn" onclick="regenerate('+idx+')">Regenerate</button>'+
      '<button class="msg-btn" onclick="rateMsg('+idx+',1)">\\u2764</button>'+
      '<button class="msg-btn" onclick="rateMsg('+idx+',0)">\\uD83D\\uDC4E</button>'+
      '<button class="msg-btn" onclick="starMsg('+idx+')">Star</button>'+
      '</div>';
  }else{div.textContent=content;}
  document.getElementById('msgs').appendChild(div);
  S.msgs.push({role,content,ts:Date.now()});saveState();scroll();
}

function formatContent(t){
  let h=t.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  h=h.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g,'<pre><code>$1</code></pre>');
  h=h.replace(/\`([^\`]+)\`/g,'<code>$1</code>');
  h=h.replace(/\\*\\*(.*?)\\*\\*/g,'<strong>$1</strong>');
  h=h.replace(/\\*(.*?)\\*/g,'<em>$1</em>');
  h=h.replace(/\\n/g,'<br>');
  return h;
}

function addTyping(){const d=document.createElement('div');d.className='typing';d.innerHTML='<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';document.getElementById('msgs').appendChild(d);scroll();return d;}
function removeTyping(e){if(e?.parentNode)e.parentNode.remove();}
function scroll(){setTimeout(()=>{const c=document.getElementById('chatTab');c.scrollTop=c.scrollHeight;},50);}
function onKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}}
function autoH(t){t.style.height='auto';t.style.height=Math.min(t.scrollHeight,100)+'px';}

function copyMsg(i){navigator.clipboard.writeText(S.msgs[i]?.content||'');tg.HapticFeedback.notificationOccurred('success');}
function regenerate(i){
  const prev=S.msgs[i-1];if(prev&&prev.role==='user'){
    S.msgs.pop();const el=document.getElementById('msgs');el.lastChild.remove();
    document.getElementById('msgInput').value=prev.content;sendMsg();
  }
}
function rateMsg(i,v){tg.HapticFeedback.notificationOccurred(v?'success':'error');}
function starMsg(i){if(!S.stars.includes(i))S.stars.push(i);saveState();tg.HapticFeedback.notificationOccurred('success');}

// === IMAGE GENERATION ===
function selRatio(el){document.querySelectorAll('.ratio-btn').forEach(b=>b.classList.remove('active'));el.classList.add('active');S.ratio=el.dataset.r;}
function selStyle(el){document.querySelectorAll('.style-btn').forEach(b=>b.classList.remove('active'));el.classList.add('active');S.style=el.dataset.s;}

async function generateImage(){
  const prompt=document.getElementById('imgPrompt').value.trim();
  if(!prompt)return alert('Enter a description');
  const btn=document.getElementById('genBtn');const txt=document.getElementById('genTxt');const sh=document.getElementById('genShimmer');
  btn.disabled=true;txt.textContent='Generating...';sh.classList.remove('hidden');
  try{
    const[w,h]=S.ratio.split(':').map(Number);const s=1024;
    const pw=document.getElementById('customW').value||s;const ph=document.getElementById('customH').value||s;
    const url='https://image.pollinations.ai/prompt/'+encodeURIComponent(prompt+S.style)+'?width='+pw+'&height='+ph+'&nologo=true&model='+S.model+'&seed='+Math.floor(Math.random()*999999);
    const div=document.createElement('div');div.innerHTML='<img src="'+url+'" style="width:100%;border-radius:10px;margin-top:8px"><div style="font-size:12px;color:var(--txt2);margin-top:4px">'+prompt+'</div>';
    document.getElementById('imgResult').innerHTML='';document.getElementById('imgResult').appendChild(div);
    S.gallery.push({url,prompt,ts:Date.now()});saveState();renderGallery();
    tg.HapticFeedback.notificationOccurred('success');
  }catch(e){document.getElementById('imgResult').innerHTML='<div style="color:red">Error: '+e.message+'</div>';}
  btn.disabled=false;txt.textContent='\\u2728 Generate';sh.classList.add('hidden');
}

function renderGallery(){
  const g=document.getElementById('gallery');const e=document.getElementById('galleryEmpty');
  if(!S.gallery.length){g.innerHTML='';e.style.display='block';return;}
  e.style.display='none';g.innerHTML='';
  S.gallery.slice(-20).reverse().forEach(item=>{
    const d=document.createElement('div');d.className='gallery-item';
    d.innerHTML='<img src="'+item.url+'" alt="'+item.prompt+'" onclick="window.open(this.src)">';
    g.appendChild(d);
  });
}

// === VOICE INPUT ===
function startVoice(){
  if(!('webkitSpeechRecognition' in window)&&!('SpeechRecognition' in window)){alert('Voice not supported');return;}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const r=new SR();r.lang='fa-IR';r.interimResults=false;
  r.onresult=e=>{document.getElementById('msgInput').value=e.results[0][0].transcript;};
  r.onerror=e=>{console.log('Voice error:',e);};
  r.start();tg.HapticFeedback.impactOccurred('light');
}

// === TTS ===
function doTTS(){
  const text=document.getElementById('msgInput').value.trim();
  if(!text){alert('Enter text first');return;}
  const u=new SpeechSynthesisUtterance(text);u.lang='fa-IR';speechSynthesis.speak(u);
}

// === EXPORT ===
function exportChat(){
  let md='# Hermes AI Chat Export\\n\\n';
  S.msgs.forEach(m=>{md+='**'+(m.role==='user'?'User':'AI')+':** '+m.content+'\\n\\n';});
  const blob=new Blob([md],{type:'text/markdown'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hermes-chat.md';a.click();
}

function shareChat(){
  const text=S.msgs.slice(-3).map(m=>(m.role==='user'?'Me':'AI')+': '+m.content.substring(0,100)).join('\\n');
  if(navigator.share){navigator.share({title:'Hermes AI Chat',text});}
  else{navigator.clipboard.writeText(text);alert('Copied!');}
}

// === LEVELS ===
function checkLevel(){const newL=Math.floor(S.xp/100)+1;if(newL>S.level){S.level=newL;tg.HapticFeedback.notificationOccurred('success');}}

// === GAMES ===
let gameState=null;
function startGame(type){
  const area=document.getElementById('gameArea');
  if(type==='guess'){
    const num=Math.floor(Math.random()*100)+1;gameState={type:'guess',num,tries:0};
    area.innerHTML='<div class="game-title">Guess the Number (1-100)</div><input class="game-input" id="guessInput" type="number" min="1" max="100"><br><button class="game-btn" onclick="checkGuess()">Guess</button><div id="guessResult" style="margin-top:10px;color:var(--txt2)"></div>';
  }else if(type==='rps'){
    area.innerHTML='<div class="game-title">Rock Paper Scissors</div><div style="display:flex;gap:12px;justify-content:center;margin-top:12px"><button class="game-btn" onclick="playRPS(0)">\\u270A Rock</button><button class="game-btn" onclick="playRPS(1)">\\u270B Paper</button><button class="game-btn" onclick="playRPS(2)">\\u270C Scissors</button></div><div id="rpsResult" style="margin-top:12px;text-align:center"></div>';
  }else if(type==='math'){
    const a=Math.floor(Math.random()*50)+1;const b=Math.floor(Math.random()*50)+1;const ops=['+','-','*'];const op=ops[Math.floor(Math.random()*3)];
    const ans=eval(a+op+b);gameState={type:'math',ans};
    area.innerHTML='<div class="game-title">What is '+a+' '+op+' '+b+'?</div><input class="game-input" id="mathInput" type="number"><br><button class="game-btn" onclick="checkMath()">Answer</button><div id="mathResult" style="margin-top:10px"></div>';
  }else{
    const prompt=type==='word'?'Start a word game where you give a word and I guess':
      type==='story'?'Start an interactive story for me':
      'Give me a trivia question';
    document.getElementById('msgInput').value=prompt;switchTab(document.querySelector('[data-tab="chat"]'));sendMsg();
  }
}

function checkGuess(){
  const val=parseInt(document.getElementById('guessInput').value);gameState.tries++;
  const el=document.getElementById('guessResult');
  if(val===gameState.num){el.innerHTML='<span style="color:var(--gold)">Correct! '+gameState.tries+' tries</span>';tg.HapticFeedback.notificationOccurred('success');}
  else if(val<gameState.num){el.textContent='Higher!';tg.HapticFeedback.impactOccurred('light');}
  else{el.textContent='Lower!';tg.HapticFeedback.impactOccurred('light');}
}

function playRPS(player){
  const ai=Math.floor(Math.random()*3);const names=['\\u270A','\\u270B','\\u270C'];
  const result=player===ai?'Draw':(player+1)%3===ai?'You Win!':'AI Wins!';
  document.getElementById('rpsResult').innerHTML='<div style="font-size:24px">You: '+names[player]+' vs AI: '+names[ai]+'</div><div style="font-size:20px;color:var(--gold);margin-top:8px">'+result+'</div>';
  tg.HapticFeedback.notificationOccurred(result.includes('Win')?'success':'error');
}

function checkMath(){
  const val=parseInt(document.getElementById('mathInput').value);
  const el=document.getElementById('mathResult');
  if(val===gameState.ans){el.innerHTML='<span style="color:var(--gold)">Correct!</span>';tg.HapticFeedback.notificationOccurred('success');}
  else{el.innerHTML='<span style="color:#ef4444">Wrong! Answer: '+gameState.ans+'</span>';}
}

// === PANELS ===
function openPanel(type){
  const overlay=document.getElementById('drawerOverlay');const content=document.getElementById('drawerContent');
  if(type==='models'){
    let html='<div class="drawer-hdr"><h3>Select Model</h3><button class="close" onclick="closePanel()">x</button></div>';
    const groups={text:'Chat Models',image:'Image Models'};
    for(const[cat,label]of Object.entries(groups)){
      const ms=MODELS.filter(m=>m.cat===cat||cat==='text'&&m.cat==='code');if(!ms.length)continue;
      html+='<div class="section-label">'+label+'</div>';
      ms.forEach(m=>{html+='<div class="mdl-item'+(m.id===S.model?' active':'')+'" onclick=\\x27selModel("'+m.id+'")\\x27><div class="mdl-icon">'+m.icon+'</div><div class="mdl-info"><div class="mdl-name">'+m.name+'</div><div class="mdl-desc">'+m.type+'</div></div><div class="mdl-check">\\u2713</div></div>';});
    }
    content.innerHTML=html;overlay.classList.add('active');
  }else if(type==='settings'){
    const mOverlay=document.getElementById('modalOverlay');const mc=document.getElementById('modalContent');
    mc.innerHTML='<div class="modal-hdr"><h3>Settings</h3><button class="close" onclick="closeModal()">x</button></div>'+
      '<div class="section-label">Personality</div>'+
      '<div class="personality-grid">'+
      [['default','\\uD83E\\uDD16','Default','Helpful'],['shoj','\\uD83E\\uDD23','Funny','Humor'],['jidi','\\uD83D\\uDC68\\u200D\\uD83D\\uDCBB','Serious','Professional'],['filasafi','\\uD83E\\uDDD0','Philosopher','Deep think'],['moalem','\\uD83D\\uDC68\\u200D\\uD83C\\uDFEB','Teacher','Step by step'],['barnameh','\\uD83D\\uDCBB','Coder','Expert code']].map(([id,icon,name,desc])=>'<div class="personality-card'+(S.personality===id?' active':'')+'" onclick=\\x27setPersonality("'+id+'")\\x27><div class="p-icon">'+icon+'</div><div class="p-name">'+name+'</div><div class="p-desc">'+desc+'</div></div>').join('')+
      '</div>'+
      '<div class="section-label" style="margin-top:12px">Font Size</div>'+
      '<div style="display:flex;gap:8px;align-items:center"><input type="range" min="12" max="22" value="'+S.fontSize+'" onchange="setFontSize(this.value)" style="flex:1"><span id="fsVal" style="color:var(--gold);min-width:30px">'+S.fontSize+'</span></div>'+
      '<div class="section-label" style="margin-top:12px">Level</div>'+
      '<div class="level-bar"><div class="bar"><div class="bar-fill" style="width:'+((S.xp%100))+'%"></div></div><div class="level-text">Lv.'+S.level+'</div></div>'+
      '<button class="action-btn secondary" onclick="openPanel(\\x27profile\\x27)">View Profile</button>'+
      '<button class="action-btn danger" onclick="clearHistory()">Clear History</button>'+
      '<button class="action-btn secondary" onclick="closeModal()">Close</button>';
    mOverlay.classList.add('active');
  }else if(type==='search'){
    const mOverlay=document.getElementById('modalOverlay');const mc=document.getElementById('modalContent');
    mc.innerHTML='<div class="modal-hdr"><h3>Search History</h3><button class="close" onclick="closeModal()">x</button></div>'+
      '<div class="search-bar"><input id="searchInput" placeholder="Search messages..." oninput="doSearch()"></div>'+
      '<div id="searchResults" style="max-height:50vh;overflow-y:auto"></div>';
    mOverlay.classList.add('active');
  }else if(type==='calc'){
    const mOverlay=document.getElementById('modalOverlay');const mc=document.getElementById('modalContent');
    mc.innerHTML='<div class="modal-hdr"><h3>Calculator</h3><button class="close" onclick="closeModal()">x</button></div>'+
      '<div class="calc-display" id="calcDisplay">0</div>'+
      '<div class="calc-grid">'+
      ['C','+/-','%','/','7','8','9','*','4','5','6','-','1','2','3','+','0','.','=','back'].map(b=>
        '<div class="calc-btn'+(b==='/'||b==='*'||b==='-'||b==='+'?' op':'')+(b==='='?' eq':'')+'" onclick="calcPress(\\x27'+b+'\\x27)">'+(b==='back'?'\\u232B':b)+'</div>'
      ).join('')+'</div>';
    mOverlay.classList.add('active');
  }else if(type==='translate'){
    document.getElementById('msgInput').value='Translate to English: ';switchTab(document.querySelector('[data-tab="chat"]'));document.getElementById('msgInput').focus();
  }else if(type==='profile'){
    const mOverlay=document.getElementById('modalOverlay');const mc=document.getElementById('modalContent');
    mc.innerHTML='<div class="modal-hdr"><h3>Profile</h3><button class="close" onclick="closeModal()">x</button></div>'+
      '<div style="text-align:center;padding:16px">'+
      '<div style="font-size:48px;margin-bottom:8px">\\uD83D\\uDC64</div>'+
      '<div style="font-size:18px;font-weight:700">'+(tg.initDataUnsafe?.user?.first_name||'User')+'</div>'+
      '<div class="level-bar" style="justify-content:center;margin:12px 0"><div class="bar" style="max-width:200px"><div class="bar-fill" style="width:'+((S.xp%100))+'%"></div></div><div class="level-text">Lv.'+S.level+'</div></div>'+
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">'+
      '<div style="background:var(--glass);border:1px solid var(--brd);border-radius:10px;padding:12px"><div style="font-size:20px;color:var(--gold)">'+S.msgs.length+'</div><div style="font-size:11px;color:var(--txt3)">Messages</div></div>'+
      '<div style="background:var(--glass);border:1px solid var(--brd);border-radius:10px;padding:12px"><div style="font-size:20px;color:var(--gold)">'+S.gallery.length+'</div><div style="font-size:11px;color:var(--txt3)">Images</div></div>'+
      '<div style="background:var(--glass);border:1px solid var(--brd);border-radius:10px;padding:12px"><div style="font-size:20px;color:var(--gold)">'+S.stars.length+'</div><div style="font-size:11px;color:var(--txt3)">Starred</div></div>'+
      '</div></div>'+
      '<button class="action-btn secondary" onclick="closeModal()">Close</button>';
    mOverlay.classList.add('active');
  }
}

function closePanel(e){if(!e||e.target===document.getElementById('drawerOverlay'))document.getElementById('drawerOverlay').classList.remove('active');}
function closeModal(e){if(!e||e.target===document.getElementById('modalOverlay'))document.getElementById('modalOverlay').classList.remove('active');}

function selModel(id){S.model=id;updateModel();closePanel();saveState();if(MODELS.find(m=>m.id===id)?.cat==='image')switchTab(document.querySelector('[data-tab="image"]'));}
function setPersonality(p){S.personality=p;saveState();openPanel('settings');}
function setFontSize(v){S.fontSize=parseInt(v);document.documentElement.style.setProperty('--fs',v+'px');document.getElementById('fsVal').textContent=v;saveState();}

// Calculator
let calcStr='';
function calcPress(b){
  if(b==='C'){calcStr='';}else if(b==='='){try{calcStr=String(eval(calcStr));}catch(e){calcStr='Error';}}else if(b==='back'){calcStr=calcStr.slice(0,-1);}else if(b==='+/-'){calcStr=calcStr.startsWith('-')?calcStr.slice(1):'-'+calcStr;}else{calcStr+=b;}
  document.getElementById('calcDisplay').textContent=calcStr||'0';
}

// Search
function doSearch(){
  const q=document.getElementById('searchInput').value.toLowerCase();const r=document.getElementById('searchResults');
  if(!q){r.innerHTML='';return;}
  const hits=S.msgs.filter(m=>m.content.toLowerCase().includes(q)).slice(0,10);
  r.innerHTML=hits.map(m=>'<div style="padding:8px;background:var(--glass);border:1px solid var(--brd);border-radius:8px;margin-bottom:6px"><div style="font-size:11px;color:var(--gold);margin-bottom:4px">'+(m.role==='user'?'You':'AI')+'</div><div style="font-size:13px">'+m.content.substring(0,200)+'</div></div>').join('')||'<div style="color:var(--txt3);text-align:center;padding:16px">No results</div>';
}

function clearHistory(){if(confirm('Clear all history?')){S.msgs=[];S.gallery=[];S.stars=[];S.xp=0;S.level=1;saveState();document.getElementById('msgs').innerHTML='';document.getElementById('welcome').style.display='flex';closeModal();}}

document.addEventListener('DOMContentLoaded',init);
<\/script>
</body>
</html>`;
}
