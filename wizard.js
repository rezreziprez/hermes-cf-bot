// =============================================================
//  Hermes CF Bot — Self-Deploying Wizard
//  ساخته شده توسط iprez
//  آپلود کن توی Cloudflare Worker → باز کن → تمام!
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
    return new Response('Hermes CF Bot — ساخته شده توسط iprez ❤️', { status: 200 });
  },
};

async function handleUpdate(update, env) {
  const msg = update.message;
  if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const name = msg.chat.first_name || 'دوست عزیز';
  await upsertUser(env, chatId, msg.chat.username, name);

  if (text === '/start') return send(env, chatId, 'سلام ' + name + '! 👋\\n\\nمن یه دستیار هوش مصنوعی هستم.\\n\\nدستورات:\\n/clear — پاک کردن تاریخچه\\n/system [متن] — تنظیم پرامپت\\n/model [نام] — تغییر مدل\\n/settings — تنظیمات');
  if (text === '/clear') { await env.DB.prepare('DELETE FROM messages WHERE chat_id = ?').bind(chatId).run(); return send(env, chatId, '✅ تاریخچه پاک شد.'); }
  if (text.startsWith('/system')) { const p = text.replace('/system','').trim(); if(!p) return send(env,chatId,'❌ متن رو بنویس.'); await env.DB.prepare('UPDATE users SET system_prompt = ? WHERE chat_id = ?').bind(p,chatId).run(); return send(env,chatId,'✅ پرامپت تنظیم شد.'); }
  if (text.startsWith('/model')) { const m = text.replace('/model','').trim(); if(!m) return send(env,chatId,'❌ نام مدل رو بنویس.'); await env.DB.prepare('UPDATE users SET model = ? WHERE chat_id = ?').bind(m,chatId).run(); return send(env,chatId,'✅ مدل: '+m); }
  if (text === '/settings') { const s = await env.DB.prepare('SELECT system_prompt, model FROM users WHERE chat_id = ?').bind(chatId).first(); return send(env,chatId,'⚙️ مدل: '+(s?.model||'پیش‌فرض')+'\\nپرامپت: '+(s?.system_prompt||'پیش‌فرض')); }

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
    const reply = data.choices?.[0]?.message?.content || 'جوابی دریافت نشد.';
    await saveMsg(env, chatId, 'assistant', reply);
    return send(env, chatId, reply);
  } catch (e) { return send(env, chatId, '❌ خطا: ' + e.message); }
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

// ===================== HTML WIZARD PAGE =====================

function wizardPage() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>نصب بات هوشمند — Hermes CF</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#e6e6e6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.c{background:#141414;border:1px solid #2a2a2a;border-radius:18px;padding:32px;max-width:520px;width:100%;box-shadow:0 12px 48px rgba(0,0,0,.5)}
.h{text-align:center;margin-bottom:28px}
.h h1{font-size:26px;background:linear-gradient(135deg,#6366f1,#22d3ee,#22c55e);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.h p{color:#666;margin-top:6px;font-size:13px}
.s{display:none}.s.on{display:block}
.fg{margin-bottom:18px}
label{display:block;margin-bottom:6px;font-weight:600;font-size:13px;color:#aaa}
input,textarea{width:100%;padding:11px 14px;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:10px;color:#e6e6e6;font-size:14px;transition:.2s}
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
.log{margin:12px 0;max-height:200px;overflow-y:auto;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:10px;padding:12px;font-size:12px;font-family:monospace;text-align:left;direction:ltr}
.log div{padding:3px 0;border-bottom:1px solid #111}
.log .d{color:#22c55e}.log .e{color:#ef4444}.log .i{color:#6366f1}
.tg{display:block;text-align:center;background:linear-gradient(135deg,#2AABEE,#229ED9);color:#fff;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;margin-top:16px;font-size:15px}
.tg:hover{opacity:.9;text-decoration:none}
</style>
</head>
<body>
<div class="c">
  <div class="h"><h1>⚡ نصب بات هوشمند</h1><p>نصب خودکار روی Cloudflare Workers</p></div>

  <!-- STEP 1: API Token -->
  <div class="s on" id="s1">
    <div class="fg">
      <label>🔑 Cloudflare API Token</label>
      <input type="password" id="cfToken" placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
      <p class="ht">از <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank">اینجا</a> بساز (Edit Cloudflare Workers)</p>
    </div>
    <button class="btn bp" onclick="toStep(2)">ادامه →</button>
  </div>

  <!-- STEP 2: Telegram + AI -->
  <div class="s" id="s2">
    <div class="fg"><label>🤖 توکن بات تلگرام</label><input type="text" id="tgToken" placeholder="1234567890:ABCdef..."><p class="ht">از <a href="https://t.me/BotFather" target="_blank">@BotFather</a></p></div>
    <div class="fg"><label>🔑 API Key هوش مصنوعی</label><input type="text" id="aiKey" placeholder="sk-xxx..."></div>
    <div class="fg"><label>🌐 آدرس API</label><input type="text" id="aiUrl" value="https://9router-production-d4c69.up.railway.app/v1"></div>
    <div class="fg"><label>🧠 مدل</label><input type="text" id="aiModel" value="vipai"></div>
    <div class="fg"><label>💬 سیستم پرامپت</label><textarea id="aiPrompt">تو یه دستیار هوش مصنوعی کمک‌حال هستی. به فارسی جواب بده. اسمت هرمس هست و توسط iprez ساخته شدی.</textarea></div>
    <button class="btn bp" id="runBtn" onclick="deploy()">🚀 نصب خودکار</button>
    <button class="btn bb" onclick="toStep(1)">← برگشت</button>
    <div class="st" id="sts"></div>
    <div class="log" id="log" style="display:none"></div>
  </div>

  <!-- STEP 3: Done -->
  <div class="s" id="s3">
    <h2 style="text-align:center;color:#22c55e;margin-bottom:16px">✅ نصب با موفقیت انجام شد!</h2>
    <div class="log" id="finalLog"></div>
    <a class="tg" id="tgLink" href="#" target="_blank">🤖 باز کردن بات تلگرام</a>
    <button class="btn bb" style="margin-top:12px" onclick="location.reload()">🔄 نصب مجدد</button>
  </div>
</div>

<script>
const $ = id => document.getElementById(id);
function toStep(n){document.querySelectorAll('.s').forEach(x=>x.classList.remove('on'));$('s'+n).classList.add('on')}

function log(msg,type){
  const el=$('log');el.style.display='block';
  const d=document.createElement('div');d.className=type||'i';d.textContent=msg;el.appendChild(d);el.scrollTop=el.scrollHeight;
}

function st(msg,type){const el=$('sts');el.className='st '+(type||'ld');el.innerHTML=type==='ld'?msg+'<span class="sp"></span>':msg}

async function cf(path,method,body){
  const tk=$('cfToken').value.trim();
  if(!tk)throw new Error('API Token رو وارد کن');
  // اول Account ID رو بگیر
  const ar=await fetch('https://api.cloudflare.com/client/v4/accounts',{headers:{'Authorization':'Bearer '+tk}});
  const ad=await ar.json();
  if(!ad.success||!ad.result.length)throw new Error('Account پیدا نشد. Token رو چک کن.');
  const aid=ad.result[0].id;
  const opts={method,headers:{'Authorization':'Bearer '+tk,'Content-Type':'application/json'}};
  if(body)opts.body=JSON.stringify(body);
  const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+aid+'/'+path,opts);
  const d=await r.json();
  if(!d.success)throw new Error(d.errors?.[0]?.message||'CF API Error');
  window._cfAccountId=aid;
  return d;
}

async function deploy(){
  const btn=$('runBtn');btn.disabled=true;
  const tgToken=$('tgToken').value.trim();
  const aiKey=$('aiKey').value.trim();
  const aiUrl=$('aiUrl').value.trim();
  const aiModel=$('aiModel').value.trim();
  const aiPrompt=$('aiPrompt').value.trim();

  if(!$('cfToken').value.trim()||!tgToken||!aiKey){st('همه فیلدها رو پر کن.','err');btn.disabled=false;return}

  try{
    // 1. Create D1
    st('🗄️ ساخت D1 Database...','ld');log('Creating D1 database...','i');
    const d1=await cf('d1/database','POST',{name:'hermes-bot-db-'+Date.now()});
    const dbId=d1.result.id;
    log('D1 created: '+dbId,'d');

    // 2. Create D1 tables
    st('📋 ساخت جداول...','ld');log('Creating tables...','i');
    await cf('d1/database/'+dbId+'/query','POST',{sql:"CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);CREATE TABLE IF NOT EXISTS users (chat_id INTEGER PRIMARY KEY, username TEXT, first_name TEXT, system_prompt TEXT, model TEXT DEFAULT 'gpt-4o-mini', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));"});
    log('Tables created','d');

    // 3. Create KV
    st('🗃️ ساخت KV Namespace...','ld');log('Creating KV namespace...','i');
    const kv=await cf('storage/kv/namespaces','POST',{title:'hermes-bot-kv-'+Date.now()});
    const kvId=kv.result.id;
    log('KV created: '+kvId,'d');

    // 4. Deploy Worker
    st('📦 دیپلوی Worker...','ld');log('Deploying worker...','i');
    const meta={main_module:'main.js',bindings:[{name:'DB',type:'d1_database',id:dbId},{name:'KV',type:'kv_namespace',namespace_id:kvId}],compatibility_date:'2024-12-01'};
    const fd=new FormData();
    fd.append('main.js',new Blob([BOT_CODE],{type:'application/javascript'}),'main.js');
    fd.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}),'metadata.json');
    const dr=await fetch('https://api.cloudflare.com/client/v4/accounts/'+window._cfAccountId+'/workers/scripts/hermes-bot',{method:'PUT',headers:{'Authorization':'Bearer '+$('cfToken').value.trim()},body:fd});
    const dd=await dr.json();
    if(!dd.success)throw new Error(dd.errors?.[0]?.message||'Deploy failed');
    log('Worker deployed!','d');

    // 5. Set secrets
    st('🔐 تنظیم رمزها...','ld');log('Setting secrets...','i');
    const secrets=[
      {name:'TELEGRAM_BOT_TOKEN',text:tgToken},
      {name:'OPENAI_API_KEY',text:aiKey},
      {name:'OPENAI_BASE_URL',text:aiUrl},
      {name:'MODEL_NAME',text:aiModel},
      {name:'SYSTEM_PROMPT',text:aiPrompt}
    ];
    for(const s of secrets){
      await fetch('https://api.cloudflare.com/client/v4/accounts/'+window._cfAccountId+'/workers/scripts/hermes-bot/secrets',{method:'PUT',headers:{'Authorization':'Bearer '+$('cfToken').value.trim(),'Content-Type':'application/json'},body:JSON.stringify(s)});
      log('Secret set: '+s.name,'d');
    }

    // 6. Enable workers.dev
    st('🌐 فعال‌سازی workers.dev...','ld');log('Enabling workers.dev...','i');
    try{
      await fetch('https://api.cloudflare.com/client/v4/accounts/'+window._cfAccountId+'/workers/scripts/hermes-bot/subdomain',{method:'POST',headers:{'Authorization':'Bearer '+$('cfToken').value.trim(),'Content-Type':'application/json'},body:JSON.stringify({enabled:true})});
      log('workers.dev enabled','d');
    }catch(e){log('workers.dev: '+e.message,'e')}

    // 7. Get worker URL and setup webhook
    st('🔗 تنظیم وب‌هوک تلگرام...','ld');log('Setting up Telegram webhook...','i');
    const sub=await fetch('https://api.cloudflare.com/client/v4/accounts/'+window._cfAccountId+'/workers/scripts/hermes-bot/subdomain',{headers:{'Authorization':'Bearer '+$('cfToken').value.trim()}});
    const sd=await sub.json();
    let workerUrl='';
    if(sd.result&&sd.result.enabled){
      workerUrl='https://hermes-bot.'+sd.result.preview_id+'.workers.dev';
    }else{
      // Try scripts endpoint
      const sr=await cf('workers/scripts/hermes-bot/settings/v2','GET');
      if(sd.result)workerUrl='https://hermes-bot.'+sd.result.preview_id+'.workers.dev';
    }
    log('Worker URL: '+workerUrl,'i');

    // Setup webhook
    const webhookUrl=workerUrl+'/webhook';
    const wRes=await fetch('https://api.telegram.org/bot'+tgToken+'/setWebhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:webhookUrl,allowed_updates:['message']})});
    const wData=await wRes.json();
    if(wData.ok){
      log('Webhook set: '+webhookUrl,'d');
    }else{
      log('Webhook warning: '+JSON.stringify(wData),'e');
    }

    // Done!
    st('','ok');
    toStep(3);
    $('finalLog').innerHTML=$('log').innerHTML;
    $('tgLink').href='https://t.me/'+tgToken.split(':')[0];

  }catch(e){
    st('❌ '+e.message,'err');log('ERROR: '+e.message,'e');
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

    if (url.pathname === '/' || url.pathname === '/setup') {
      return new Response(wizardPage(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
