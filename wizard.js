// =============================================================
//  Hermes CF Bot — Self-Deploying Wizard (English UI)
//  Built by iprez
//  Upload to Cloudflare Worker → Open URL → Done!
// =============================================================

const BOT_CODE = `
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
        console.error('Webhook error:', e.message);
        return new Response('Error', { status: 500 });
      }
    }
    return new Response('Hermes CF Bot — Built by iprez', { status: 200 });
  },
};

async function handleUpdate(update, env) {
  const msg = update.message;
  if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const name = msg.chat.first_name || 'User';
  await upsertUser(env, chatId, msg.chat.username, name);

  if (text === '/start') return send(env, chatId, 'Hi ' + name + '!\\n\\nI am an AI assistant.\\n\\nCommands:\\n/clear — Clear history\\n/system [text] — Set system prompt\\n/model [name] — Change model\\n/settings — Show settings');
  if (text === '/clear') { await env.DB.prepare('DELETE FROM messages WHERE chat_id = ?').bind(chatId).run(); return send(env, chatId, 'History cleared.'); }
  if (text.startsWith('/system')) { const p = text.replace('/system','').trim(); if(!p) return send(env,chatId,'Please provide a prompt.'); await env.DB.prepare('UPDATE users SET system_prompt = ? WHERE chat_id = ?').bind(p,chatId).run(); return send(env,chatId,'System prompt set.'); }
  if (text.startsWith('/model')) { const m = text.replace('/model','').trim(); if(!m) return send(env,chatId,'Please provide a model name.'); await env.DB.prepare('UPDATE users SET model = ? WHERE chat_id = ?').bind(m,chatId).run(); return send(env,chatId,'Model changed to: '+m); }
  if (text === '/settings') { const s = await env.DB.prepare('SELECT system_prompt, model FROM users WHERE chat_id = ?').bind(chatId).first(); return send(env,chatId,'Model: '+(s?.model||'default')+'\\nPrompt: '+(s?.system_prompt||'default')); }

  await saveMsg(env, chatId, 'user', text);
  const history = await getHistory(env, chatId, 20);
  const settings = await env.DB.prepare('SELECT system_prompt, model FROM users WHERE chat_id = ?').bind(chatId).first();
  try {
    const sysPrompt = settings?.system_prompt || env.SYSTEM_PROMPT || 'You are a helpful assistant.';
    const model = settings?.model || env.MODEL_NAME || 'gpt-4o-mini';
    const base = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.OPENAI_API_KEY },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: sysPrompt }, ...history], max_tokens: 2048, temperature: 0.7 })
    });
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || 'No response received.';
    await saveMsg(env, chatId, 'assistant', reply);
    return send(env, chatId, reply);
  } catch (e) { return send(env, chatId, 'Error: ' + e.message); }
}

async function send(env, chatId, text) {
  const chunks = []; let t = text;
  while (t.length > 0) { if (t.length <= 4000) { chunks.push(t); break; } let c = t.lastIndexOf('\\n', 4000); if (c === -1 || c < 2000) c = 4000; chunks.push(t.slice(0, c)); t = t.slice(c); }
  for (const chunk of chunks) { await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }) }); }
}
async function saveMsg(env, chatId, role, content) { await env.DB.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)').bind(chatId, role, content).run(); }
async function getHistory(env, chatId, limit) { const { results } = await env.DB.prepare('SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?').bind(chatId, limit).all(); return results ? results.reverse() : []; }
async function upsertUser(env, chatId, username, firstName) { await env.DB.prepare("INSERT INTO users (chat_id, username, first_name, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(chat_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, updated_at=datetime('now')").bind(chatId, username||null, firstName||null).run(); }
`;

// ===================== PROXY HANDLER =====================
// All CF API calls go through the Worker (fixes CORS)

async function handleProxy(request) {
  const body = await request.json();
  const { path, method, data, token, accountId } = body;

  const opts = {
    method: method || 'GET',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
  };

  // For FormData uploads (worker deploy)
  if (data && typeof data === 'object' && data._multipart) {
    const fd = new FormData();
    for (const part of data._parts) {
      fd.append(part.name, new Blob([part.content], { type: part.type }), part.filename);
    }
    opts.body = fd;
    delete opts.headers['Content-Type'];
  } else if (data && method !== 'GET') {
    opts.body = JSON.stringify(data);
  }

  const url = 'https://api.cloudflare.com/client/v4/accounts/' + accountId + '/' + path;
  const res = await fetch(url, opts);
  const json = await res.json();
  return Response.json(json);
}

// ===================== HTML WIZARD PAGE =====================

function wizardPage() {
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hermes CF Bot — Installer</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e6e6e6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.c{background:#141414;border:1px solid #2a2a2a;border-radius:18px;padding:32px;max-width:520px;width:100%;box-shadow:0 12px 48px rgba(0,0,0,.5)}
.h{text-align:center;margin-bottom:28px}
.h h1{font-size:26px;background:linear-gradient(135deg,#6366f1,#22d3ee,#22c55e);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.h p{color:#666;margin-top:6px;font-size:13px}
.s{display:none}.s.on{display:block}
.fg{margin-bottom:18px}
label{display:block;margin-bottom:6px;font-weight:600;font-size:13px;color:#aaa}
input,textarea{width:100%;padding:11px 14px;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:10px;color:#e6e6e6;font-size:14px;transition:.2s;font-family:system-ui}
input:focus,textarea:focus{outline:none;border-color:#6366f1}
textarea{resize:vertical;min-height:70px}
.ht{font-size:11px;color:#555;margin-top:5px}
a{color:#6366f1;text-decoration:none}a:hover{text-decoration:underline}
.btn{width:100%;padding:13px;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;transition:.2s;margin-top:8px}
.bp{background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff}
.bp:hover{opacity:.9}.bp:disabled{opacity:.4;cursor:not-allowed}
.bb{background:#1a1a1a;color:#666;margin-top:6px}
.st{padding:10px 14px;border-radius:10px;margin:10px 0;font-size:13px;display:none}
.st.err{background:#2a1515;border:1px solid #ef4444;color:#ef4444;display:block}
.st.ok{background:#152a15;border:1px solid #22c55e;color:#22c55e;display:block}
.st.ld{background:#151a2a;border:1px solid #6366f1;color:#a5b4fc;display:block}
@keyframes sp{to{transform:rotate(360deg)}}
.sp{display:inline-block;width:14px;height:14px;border:2px solid #6366f1;border-top-color:transparent;border-radius:50%;animation:sp .7s linear infinite;vertical-align:middle;margin-right:6px}
.log{margin:12px 0;max-height:250px;overflow-y:auto;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:10px;padding:12px;font-size:12px;font-family:monospace;text-align:left}
.log div{padding:3px 0;border-bottom:1px solid #111}
.log .d{color:#22c55e}.log .e{color:#ef4444}.log .i{color:#6366f1}
.tg{display:block;text-align:center;background:linear-gradient(135deg,#2AABEE,#229ED9);color:#fff;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;margin-top:16px;font-size:15px}
.tg:hover{opacity:.9;text-decoration:none}
.info{background:#151a2a;border:1px solid #6366f1;border-radius:10px;padding:12px;margin:12px 0;font-size:12px;color:#a5b4fc}
</style>
</head>
<body>
<div class="c">
  <div class="h"><h1>Hermes CF Bot</h1><p>One-click installer for Cloudflare Workers</p></div>

  <!-- STEP 1: API Token -->
  <div class="s on" id="s1">
    <div class="fg">
      <label>Cloudflare API Token</label>
      <input type="password" id="cfToken" placeholder="Paste your API token here">
      <p class="ht">Create at <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank">Cloudflare API Tokens</a> with <b>Edit Cloudflare Workers</b> permission</p>
    </div>
    <button class="btn bp" onclick="toStep(2)">Next Step</button>
    <div class="info">Your token is used only to create resources. It is never stored on any server.</div>
  </div>

  <!-- STEP 2: Telegram + AI -->
  <div class="s" id="s2">
    <div class="fg"><label>Telegram Bot Token</label><input type="text" id="tgToken" placeholder="1234567890:ABCdef..."><p class="ht">Get from <a href="https://t.me/BotFather" target="_blank">@BotFather</a></p></div>
    <div class="fg"><label>AI API Key</label><input type="text" id="aiKey" placeholder="sk-xxx..."></div>
    <div class="fg"><label>API Base URL</label><input type="text" id="aiUrl" value="https://9router-production-d4c69.up.railway.app/v1"></div>
    <div class="fg"><label>Model Name</label><input type="text" id="aiModel" value="vipai"></div>
    <div class="fg"><label>System Prompt</label><textarea id="aiPrompt">You are a helpful AI assistant. Respond in the user's language. Your name is Hermes, built by iprez.</textarea></div>
    <button class="btn bp" id="runBtn" onclick="deploy()">Deploy Now</button>
    <button class="btn bb" onclick="toStep(1)">Back</button>
    <div class="st" id="sts"></div>
    <div class="log" id="log" style="display:none"></div>
  </div>

  <!-- STEP 3: Done -->
  <div class="s" id="s3">
    <h2 style="text-align:center;color:#22c55e;margin-bottom:16px">Installation Complete!</h2>
    <div class="log" id="finalLog"></div>
    <a class="tg" id="tgLink" href="#" target="_blank">Open Telegram Bot</a>
    <button class="btn bb" style="margin-top:12px" onclick="location.reload()">Install Again</button>
  </div>
</div>

<script>
const $ = id => document.getElementById(id);
function toStep(n){document.querySelectorAll('.s').forEach(x=>x.classList.remove('on'));$('s'+n).classList.add('on')}

function logMsg(msg,type){
  const el=$('log');el.style.display='block';
  const d=document.createElement('div');d.className=type||'i';d.textContent=msg;el.appendChild(d);el.scrollTop=el.scrollHeight;
}

function st(msg,type){const el=$('sts');el.className='st '+(type||'ld');el.innerHTML=type==='ld'?msg+'<span class="sp"></span>':msg}

async function cf(path,method,data){
  const tk=$('cfToken').value.trim();
  if(!tk)throw new Error('Please enter your API Token');
  const res=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path,method,data,token:tk,accountId:window._cfAccountId})});
  const json=await res.json();
  // Cache account ID
  if(path==='accounts'&&json.result&&json.result.length){
    window._cfAccountId=json.result[0].id;
  }
  if(!json.success){
    throw new Error(json.errors?.[0]?.message||'Cloudflare API Error');
  }
  return json;
}

async function deploy(){
  const btn=$('runBtn');btn.disabled=true;
  const tgToken=$('tgToken').value.trim();
  const aiKey=$('aiKey').value.trim();
  const aiUrl=$('aiUrl').value.trim();
  const aiModel=$('aiModel').value.trim();
  const aiPrompt=$('aiPrompt').value.trim();

  if(!$('cfToken').value.trim()||!tgToken||!aiKey){st('Please fill all fields.','err');btn.disabled=false;return}

  try{
    // 0. Get Account ID
    st('Getting Cloudflare Account ID...','ld');logMsg('Fetching account info...','i');
    const accRes = await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'accounts',method:'GET',token:$('cfToken').value.trim()})});
    const accData = await accRes.json();
    if(!accData.success||!accData.result||!accData.result.length) throw new Error('Account not found. Check your API Token.');
    window._cfAccountId=accData.result[0].id;
    logMsg('Account ID: '+window._cfAccountId,'d');

    // 1. Create D1 Database
    st('Creating D1 Database...','ld');logMsg('Creating D1 database...','i');
    const d1=await cf('d1/database','POST',{name:'hermes-db-'+Date.now()});
    const dbId=d1.result.id;
    logMsg('D1 created: '+dbId,'d');

    // 2. Create D1 tables
    st('Creating database tables...','ld');logMsg('Creating tables...','i');
    await cf('d1/database/'+dbId+'/query','POST',{sql:"CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);CREATE TABLE IF NOT EXISTS users (chat_id INTEGER PRIMARY KEY, username TEXT, first_name TEXT, system_prompt TEXT, model TEXT DEFAULT 'gpt-4o-mini', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));"});
    logMsg('Tables created','d');

    // 3. Create KV Namespace
    st('Creating KV Namespace...','ld');logMsg('Creating KV namespace...','i');
    const kv=await cf('storage/kv/namespaces','POST',{title:'hermes-kv-'+Date.now()});
    const kvId=kv.result.id;
    logMsg('KV created: '+kvId,'d');

    // 4. Deploy Worker
    st('Deploying Worker...','ld');logMsg('Deploying worker...','i');
    const meta={main_module:'main.js',bindings:[{name:'DB',type:'d1_database',id:dbId},{name:'KV',type:'kv_namespace',namespace_id:kvId}],compatibility_date:'2024-12-01'};
    const fd=new FormData();
    fd.append('main.js',new Blob([BOT_CODE],{type:'application/javascript'}),'main.js');
    fd.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}),'metadata.json');
    const dr=await fetch('https://api.cloudflare.com/client/v4/accounts/'+window._cfAccountId+'/workers/scripts/hermes-bot',{method:'PUT',headers:{'Authorization':'Bearer '+$('cfToken').value.trim()},body:fd});
    const dd=await dr.json();
    if(!dd.success)throw new Error(dd.errors?.[0]?.message||'Deploy failed');
    logMsg('Worker deployed!','d');

    // 5. Set secrets
    st('Setting secrets...','ld');logMsg('Setting secrets...','i');
    const secrets=[
      {name:'TELEGRAM_BOT_TOKEN',text:tgToken},
      {name:'OPENAI_API_KEY',text:aiKey},
      {name:'OPENAI_BASE_URL',text:aiUrl},
      {name:'MODEL_NAME',text:aiModel},
      {name:'SYSTEM_PROMPT',text:aiPrompt}
    ];
    for(const s of secrets){
      await fetch('https://api.cloudflare.com/client/v4/accounts/'+window._cfAccountId+'/workers/scripts/hermes-bot/secrets',{method:'PUT',headers:{'Authorization':'Bearer '+$('cfToken').value.trim(),'Content-Type':'application/json'},body:JSON.stringify(s)});
      logMsg('Secret set: '+s.name,'d');
    }

    // 6. Enable workers.dev
    st('Enabling workers.dev...','ld');logMsg('Enabling workers.dev...','i');
    try{
      const sd=await fetch('https://api.cloudflare.com/client/v4/accounts/'+window._cfAccountId+'/workers/scripts/hermes-bot/subdomain',{method:'POST',headers:{'Authorization':'Bearer '+$('cfToken').value.trim(),'Content-Type':'application/json'},body:JSON.stringify({enabled:true})});
      await sd.json();
      logMsg('workers.dev enabled','d');
    }catch(e){logMsg('workers.dev: '+e.message,'e')}

    // 7. Get worker URL and setup webhook
    st('Setting up Telegram webhook...','ld');logMsg('Getting worker URL...','i');
    const sub=await fetch('https://api.cloudflare.com/client/v4/accounts/'+window._cfAccountId+'/workers/scripts/hermes-bot/subdomain',{headers:{'Authorization':'Bearer '+$('cfToken').value.trim()}});
    const sd2=await sub.json();
    let workerUrl='';
    if(sd2.result&&sd2.result.enabled){
      workerUrl='https://hermes-bot.'+sd2.result.preview_id+'.workers.dev';
    }
    logMsg('Worker URL: '+workerUrl,'i');

    const webhookUrl=workerUrl+'/webhook';
    const wRes=await fetch('https://api.telegram.org/bot'+tgToken+'/setWebhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:webhookUrl,allowed_updates:['message']})});
    const wData=await wRes.json();
    if(wData.ok){
      logMsg('Webhook set: '+webhookUrl,'d');
    }else{
      logMsg('Webhook warning: '+JSON.stringify(wData),'e');
    }

    // Done!
    st('','ok');
    toStep(3);
    $('finalLog').innerHTML=$('log').innerHTML;
    $('tgLink').href='https://t.me/'+tgToken.split(':')[0];

  }catch(e){
    st('Error: '+e.message,'err');logMsg('ERROR: '+e.message,'e');
    btn.disabled=false;
  }
}
</script>
</body>
</html>`;
}

// ===================== WIZARD WORKER =====================

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Proxy API calls (fixes CORS)
    if (url.pathname === '/api' && request.method === 'POST') {
      try {
        return await handleProxy(request);
      } catch (e) {
        return Response.json({ success: false, errors: [{ message: e.message }] });
      }
    }

    // Serve wizard page
    if (url.pathname === '/' || url.pathname === '/setup') {
      return new Response(wizardPage(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};

// ===================== PROXY HANDLER =====================

async function handleProxy(request) {
  const body = await request.json();
  const { path, method, data, token, accountId } = body;

  const opts = {
    method: method || 'GET',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
  };

  if (data && method !== 'GET') {
    opts.body = JSON.stringify(data);
  }

  const cfUrl = 'https://api.cloudflare.com/client/v4/' + (accountId ? 'accounts/' + accountId + '/' : '') + path;
  const res = await fetch(cfUrl, opts);
  const json = await res.json();
  return Response.json(json);
}
