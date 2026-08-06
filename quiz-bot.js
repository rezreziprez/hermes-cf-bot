// Quiz Bot v6 - Deep Rewrite
// Game Modes: Quiz, Truth or Dare, Word Guess, Speed Round
// All gameplay via editMessageText on single message

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const u = await request.json();
        if (u.inline_query) await onInline(u.inline_query, env);
        else if (u.callback_query) await onCb(u.callback_query, env);
        else if (u.message) await onMsg(u.message, env);
        return new Response('OK');
      } catch (e) { return new Response('Error: ' + e.message, { status: 500 }); }
    }
    return new Response('Quiz Bot Active', { status: 200 });
  },
};

// ============================================================
// API
// ============================================================
async function tg(env, method, body) {
  const r = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const j = await r.json();
  return j.result;
}

async function edit(env, cid, mid, text, kb) {
  const b = { chat_id: cid, message_id: mid, text, parse_mode: 'HTML' };
  if (kb !== undefined) b.reply_markup = kb;
  try { await tg(env, 'editMessageText', b); } catch (e) {}
}

async function cb(env, id, txt, alert) {
  try { await tg(env, 'answerCallbackQuery', { callback_query_id: id, text: txt || '', show_alert: !!alert }); } catch (e) {}
}

// ============================================================
// STATE - one game per chat
// ============================================================
const G = new Map();

function fresh(chatId) {
  return {
    chatId, st: 'idle', host: 0, hostName: '',
    mode: 'quiz', // quiz | truth | word | speed
    players: new Map(),
    cat: 'all', rounds: 10, timer: 15,
    pool: [], idx: 0, cur: null,
    ans: new Map(), msg: null, th: null
  };
}

function g(cid) {
  if (!G.has(cid)) G.set(cid, fresh(cid));
  return G.get(cid);
}

function pl(name) { return { name, score: 0, ok: 0, bad: 0, str: 0, best: 0 }; }

// ============================================================
// SHUFFLE - Fisher-Yates, build pool ONCE
// ============================================================
function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function mkPool(cat) {
  const cats = cat === 'all' ? Object.keys(QDB) : [cat];
  let p = [];
  for (const c of cats) for (const q of QDB[c]) p.push({ ...q, cat: c });
  return shuffle(p);
}

// ============================================================
// QUESTIONS DB - 20+ per category
// ============================================================
const QDB = {
  history: [
    {q:'🏛️ تخت جمشید را کی ساخت؟',a:['کوروش','داریوش','خشایارشا','اردشیر'],c:1},
    {q:'🏛️ شروع جنگ جهانی دوم؟',a:['1935','1939','1941','1945'],c:1},
    {q:'🏛️ اولین تمدن بشری؟',a:['مصر','بین‌النهرین','هند','چین'],c:1},
    {q:'🏛️ انقلاب فرانسه؟',a:['1776','1789','1804','1815'],c:1},
    {q:'🏛️ کشف آمریکا؟',a:['1488','1492','1500','1510'],c:1},
    {q:'🏛️ آخرین شاه ایران؟',a:['رضاشاه','محمدرضا شاه','احمدشاه','ناصرالدین شاه'],c:1},
    {q:'🏛️ پایتخت صفویه؟',a:['تهران','اصفهان','شیراز','تبریز'],c:1},
    {q:'🏛️ ناپلئون اهل؟',a:['ایتالیا','فرانسه','اسپانیا','آلمان'],c:1},
    {q:'🏛️ هیتلر اهل؟',a:['آلمان','اتریش','لهستان','مجارستان'],c:1},
    {q:'🏛️ پایان جنگ جهانی اول؟',a:['1916','1917','1918','1919'],c:2},
    {q:'🏛️ دیوار برلین؟',a:['1987','1988','1989','1990'],c:2},
    {q:'🏛️ روم باستان کجا بود؟',a:['یونان','ایتالیا','مصر','ایران'],c:1},
    {q:'🏛️ امپراتوری مغول؟',a:['تیمور','چنگیز','کوبلای','باتو'],c:1},
    {q:'🏛️ جنگ سرد بین؟',a:['آمریکا-چین','آمریکا-شوروی','انگلیس-فرانسه','آلمان-روسیه'],c:1},
    {q:'🏛️ انقلاب اسلامی ایران؟',a:['1355','1356','1357','1358'],c:2},
    {q:'🏛️ سازمان ملل؟',a:['1942','1943','1944','1945'],c:3},
    {q:'🏛️ اولین انسان روی ماه؟',a:['گاگارین','آرمسترانگ','آلدرین','کالینز'],c:1},
    {q:'🏛️ دیوار چین؟',a:['کنفوسیوس','شی هوانگ','چنگیز','کوبلای'],c:1},
    {q:'🏛️ قاره آمریکا کی کشف شد؟',a:['1392','1442','1492','1542'],c:2},
    {q:'🏛️ سقوط قسطنطنیه؟',a:['1442','1453','1462','1473'],c:1},
  ],
  geography: [
    {q:'🌍 بزرگترین کشور؟',a:['آمریکا','چین','کانادا','روسیه'],c:3},
    {q:'🌍 طولانیترین رود؟',a:['آمازون','نیل','می‌سی‌سی‌پی','دانوب'],c:1},
    {q:'🌍 پایتخت ژاپن؟',a:['سئول','پکن','توکیو','بانکوک'],c:2},
    {q:'🌍 بلندترین قله آفریقا؟',a:['کلیمانجارو','کنیا','اتیوپی','آطلس'],c:0},
    {q:'🌍 کوچکترین کشور؟',a:['موناکو','واتیکان','لیختن‌اشتاین','سان مارینو'],c:1},
    {q:'🌍 پایتخت استرالیا؟',a:['سیدنی','ملبورن','کانبرا','بریزبن'],c:2},
    {q:'🌍 بزرگترین جزیره؟',a:['بورنئو','ماداگاسکار','گرینلند','نیوزیلند'],c:2},
    {q:'🌍 پایتخت ترکیه؟',a:['استانبول','آنکارا','ازمیر','آنتالیا'],c:1},
    {q:'🌍 بزرگترین صحرای جهان؟',a:['گبی','صحرای بزرگ','عربستان','آتاکاما'],c:1},
    {q:'🌍 پایتخت فرانسه؟',a:['لندن','برلین','پاریس','رم'],c:2},
    {q:'🌍 پایتخت آلمان؟',a:['مونیخ','هامبورگ','برلین','فرانکفورت'],c:2},
    {q:'🌍 بلندترین قله جهان؟',a:['کی۲','اورست','کانچنجونگا','ماکالو'],c:1},
    {q:'🌍 بزرگترین دریاچه؟',a:['سوپریور','ویکتوریا','خزر','بایکال'],c:2},
    {q:'🌍 پایتخت کانادا؟',a:['تورنتو','ونکوور','مونترال','اوتاوا'],c:3},
    {q:'🌍 پایتخت برزیل؟',a:['ریو','سائوپائولو','برازیلیا','سالوادور'],c:2},
    {q:'🌍 پایتخت هند؟',a:['بمبئی','دهلی نو','کلکته','بنگلور'],c:1},
    {q:'🌍 پایتخت مصر؟',a:['اسکندریه','قاهره','لوکسور','اسوان'],c:1},
    {q:'🌍 بزرگترین کویر ایران؟',a:['لوت','کویر','دشت کویر','هامون'],c:0},
    {q:'🌍 پایتخت ایتالیا؟',a:['میلان','رم','ناپل','فلورانس'],c:1},
    {q:'🌍 پایتخت اسپانیا؟',a:['بارسلونا','مادرید','سویا','والنسیا'],c:1},
  ],
  science: [
    {q:'🔬 نماد آب؟',a:['HO','H2O','OH2','H3O'],c:1},
    {q:'🔬 سرعت نور؟',a:['100K','200K','300K','400K'],c:2},
    {q:'🔬 نزدیکترین ستاره؟',a:['سیریوس','آلفا قنطورس','خورشید','وگا'],c:2},
    {q:'🔬 گاز غالب جو؟',a:['اکسیژن','نیتروژن','CO2','هیدروژن'],c:1},
    {q:'🔬 بزرگترین سیاره؟',a:['زحل','مشتری','اورانوس','نپتون'],c:1},
    {q:'🔬 استخوان‌های بدن؟',a:['186','206','226','256'],c:1},
    {q:'🔬 الماس از چیست؟',a:['سیلیکون','کربن','آهن','طلا'],c:1},
    {q:'🔬 جاذبه را کی کشف کرد؟',a:['اینشتین','نیوتن','گالیله','کپلر'],c:1},
    {q:'🔬 فرمول نمک؟',a:['NaCl','KCl','CaCl2','MgCl2'],c:0},
    {q:'🔬 بزرگترین عضو بدن؟',a:['قلب','کبد','پوست','مغز'],c:2},
    {q:'🔬 DNA مخفف؟',a:['Deoxyribonucleic Acid','Dinitrogen Acid','Dynamic Nucleus','None'],c:0},
    {q:'🔬 نزدیکترین سیاره به خورشید؟',a:['زهره','عطارد','مریخ','زمین'],c:1},
    {q:'🔬 بزرگترین اقیانوس؟',a:['اطلس','هند','آرام','منجمد'],c:2},
    {q:'🔬 سخت‌ترین ماده؟',a:['طلا','آهن','الماس','تیتانیوم'],c:2},
    {q:'🔬 نور خورشید تا زمین؟',a:['5 دقیقه','8 دقیقه','12 دقیقه','15 دقیقه'],c:1},
    {q:'🔬 بزرگترین غده بدن؟',a:['تیروئید','کبد','لوزالمعده','طحال'],c:1},
    {q:'🔬 چند حس داریم؟',a:['4','5','6','7'],c:1},
    {q:'🔬 واحد نیرو؟',a:['وات','نیوتن','ژول','پاسکال'],c:1},
    {q:'🔬 واحد فشار؟',a:['وات','نیوتن','ژول','پاسکال'],c:3},
    {q:'🔬 رنگ گلبول قرمز؟',a:['آبی','سبز','قرمز','زرد'],c:2},
  ],
  food: [
    {q:'🍕 پیتزا اهل؟',a:['آمریکا','ایتالیا','فرانسه','اسپانیا'],c:1},
    {q:'🍕 سوشی اهل؟',a:['چین','کره','ژاپن','تایلند'],c:2},
    {q:'🍕 کباب کوبیده اهل؟',a:['ترکیه','ایران','عربستان','عراق'],c:1},
    {q:'🍕 قهوه از کجا؟',a:['برزیل','کلمبیا','اتیوپی','ترکیه'],c:2},
    {q:'🍕 چای از کجا؟',a:['هند','چین','ژاپن','سری‌لانکا'],c:1},
    {q:'🍕 ماده اصلی هوموس؟',a:['لوبیا','نخود','عدس','ماش'],c:1},
    {q:'🍕 زعفران از کجا؟',a:['هند','ایران','ترکیه','اسپانیا'],c:1},
    {q:'🍕 غذای ملی ایتالیا؟',a:['پیتزا','پاستا','ریزوتو','لازانیا'],c:1},
    {q:'🍕 میوه ملی ایران؟',a:['سیب','انار','انگور','خرما'],c:1},
    {q:'🍕 بستنی از کجا؟',a:['آمریکا','ایتالیا','چین','ایران'],c:1},
    {q:'🍕 فلفل قرمز چه طعمی؟',a:['شیرین','ترش','تند','تلخ'],c:2},
    {q:'🍕 همبرگر اهل؟',a:['آمریکا','آلمان','انگلیس','فرانسه'],c:1},
    {q:'🍕 سالاد سزار اهل؟',a:['ایتالیا','فرانسه','مکزیک','آمریکا'],c:2},
    {q:'🍕 عسل از کیست؟',a:['مورچه','زنبور','پروانه','کرم'],c:1},
    {q:'🍕 ماده اصلی نان؟',a:['برنج','گندم','جو','ذرت'],c:1},
    {q:'🍕 چای سبز از کجا؟',a:['هند','ایران','چین','ژاپن'],c:2},
    {q:'🍕 ماده اصلی شکلات؟',a:['وانیل','کاکائو','شکر','شیر'],c:1},
    {q:'🍕 پنیر موتزارلا اهل؟',a:['فرانسه','ایتالیا','سوئیس','هلند'],c:1},
    {q:'🍕 زردچوبه رنگش؟',a:['قرمز','زرد','سبز','نارنجی'],c:1},
    {q:'🍕 قارچ چیست؟',a:['گیاه','حیوان','قارچ','باکتری'],c:2},
  ],
  sports: [
    {q:'⚽ جام جهانی 2022؟',a:['روسیه','قطر','عربستان','امارات'],c:1},
    {q:'⚽ بازیکنان فوتبال؟',a:['9','10','11','12'],c:2},
    {q:'⚽ المپیک 2024؟',a:['توکیو','لندن','پاریس','لس‌آنجلس'],c:2},
    {q:'⚽ بیشترین گل ملی؟',a:['رونالدو','مسی','پله','مارادونا'],c:0},
    {q:'⚽ ویمبلدون کجا؟',a:['آمریکا','فرانسه','انگلیس','استرالیا'],c:2},
    {q:'⚽ بازیکنان والیبال؟',a:['5','6','7','8'],c:1},
    {q:'⚽ ورزش ملی ایران؟',a:['فوتبال','کشتی','والیبال','بسکتبال'],c:1},
    {q:'⚽ المپیک 2028؟',a:['پاریس','لس‌آنجلس','بریزبن','رم'],c:1},
    {q:'⚽ بولینگ چند پین؟',a:['8','10','12','15'],c:1},
    {q:'⚽ NBA مخفف؟',a:['National Basketball','New Basketball','National Ball','None'],c:0},
    {q:'⚽ جام جهانی 2026؟',a:['آمریکا/کانادا/مکزیک','آرژانتین','اسپانیا','عربستان'],c:0},
    {q:'⚽ آفساید یعنی؟',a:['خارج زمین','جلوتر از مدافع','عقب دروازه','کنار زمین'],c:1},
    {q:'⚽ تنیس چند ست؟',a:['2','3','4','5'],c:1},
    {q:'⚽ رکورد گل جام جهانی؟',a:['رونالدو','کلوزه','پله','مسی'],c:1},
    {q:'⚽ ارتفاع حلقه بسکتبال؟',a:['2.5m','3m','3.05m','3.5m'],c:2},
    {q:'⚽ امتیاز هر ست والیبال؟',a:['20','25','30','15'],c:1},
    {q:'⚽ تور دو فرانس کجاست؟',a:['ایتالیا','اسپانیا','فرانسه','آلمان'],c:2},
    {q:'⚽ فوتبال: کارت قرمز؟',a:['اخطار','اخراج','تعویض','پنالتی'],c:1},
    {q:'⚽ المپیک زمستانی ورزش یخی؟',a:['اسکی','شنا','دو','وزنه‌برداری'],c:0},
    {q:'⚽ کشتی آزاد وزن المپیکی؟',a:['4','6','8','10'],c:2},
  ],
  movies: [
    {q:'🎬 کارگردان تایتانیک؟',a:['اسپیلبرگ','کامرون','نولان','اسکورسیزی'],c:1},
    {q:'🎬 مدرسه هری پاتر؟',a:['دورمشتری','هاگوارتز','نارنیا','آزکابان'],c:1},
    {q:'🎬 اولین فیلم مارول؟',a:['ثور','آیرن من','کاپیتان','هالک'],c:1},
    {q:'🎬 Inception کی؟',a:['اسپیلبرگ','نولان','کامرون','اسکورسیزی'],c:1},
    {q:'🎬 جوکر Dark Knight؟',a:['نیکلسون','هیث لجر','فینیکس','لتو'],c:1},
    {q:'🎬 Frozen از کجا؟',a:['پیکسار','دیزنی','دیم‌ورکز','ایلومینیشن'],c:1},
    {q:'🎬 فیلم اسکاری ایرانی؟',a:['جدایی','فروشنده','دایره','بچه‌ها'],c:1},
    {q:'🎬 کارگردان فروشنده؟',a:['کیارستمی','فرهادی','مجیدی','مخملباف'],c:1},
    {q:'🎬 Avatar چه سالی؟',a:['2007','2009','2011','2013'],c:1},
    {q:'🎬 Breaking Bad درباره؟',a:['وکیل','معلم شیمی','دکتر','پلیس'],c:1},
    {q:'🎬 GoT چند فصل؟',a:['6','7','8','9'],c:2},
    {q:'🎬 Friends کجا بود؟',a:['انگلیس','آمریکا','کانادا','استرالیا'],c:1},
    {q:'🎬 ماتریکس کی؟',a:['اسپیلبرگ','واچوفسکی','نولان','کامرون'],c:1},
    {q:'🎬 شیرشاه از کجا؟',a:['پیکسار','دیزنی','دیم‌ورکز','ایلومینیشن'],c:1},
    {q:'🎬 جنگ ستارگان کی؟',a:['اسپیلبرگ','لوکاس','کامرون','نولان'],c:1},
    {q:'🎬 جوکر 2019 بازیگر؟',a:['هیث لجر','فینیکس','نیکلسون','لتو'],c:1},
    {q:'🎬 اسپایدرمن بازیگر اصلی؟',a:['مگوایر','گارفیلد','هالند','هر سه'],c:3},
    {q:'🎬 پاندای کونگ‌فو از کجا؟',a:['ژاپن','چین','کره','تایلند'],c:1},
    {q:'🎬 پیکی بلایندرز درباره؟',a:['پلیس','گانگستر','وکیل','دکتر'],c:1},
    {q:'🎬 اسکار مخفف؟',a:['آکادمی','Organization','Oscar','None'],c:0},
  ],
  music: [
    {q:'🎵 ملکه پاپ؟',a:['بیانسه','مدونا','گاگا','ریانا'],c:1},
    {q:'🎵 بیتلز اهل؟',a:['آمریکا','ایرلند','انگلیس','اسکاتلند'],c:2},
    {q:'🎵 پرفروشترین آلبوم؟',a:['Abbey Road','Thriller','Back in Black','The Wall'],c:1},
    {q:'🎵 گیتار چند سیم؟',a:['4','5','6','8'],c:2},
    {q:'🎵 پادشاه راک؟',a:['الویس','چاک بری','ریچارد','هالی'],c:0},
    {q:'🎵 پیانو کلید سفید؟',a:['36','42','52','62'],c:2},
    {q:'🎵 ساز ملی ایران؟',a:['تار','سنتور','سه‌تار','کمانچه'],c:0},
    {q:'🎵 ساز دف مال؟',a:['کردستان','آذربایجان','خوزستان','گیلان'],c:0},
    {q:'🎵 سرود ملی ایران بیت؟',a:['2','3','4','5'],c:2},
    {q:'🎵 راک از کجا؟',a:['آمریکا','انگلیس','ایرلند','آلمان'],c:0},
    {q:'🎵 بیا بریم کوه؟',a:['چاوشی','صادقی','علیزاده','فرزین'],c:1},
    {q:'🎵 مایکل جکسون لقب؟',a:['پادشاه پاپ','ملکه پاپ','سلطان راک','استاد جاز'],c:0},
    {q:'🎵 BTS اهل؟',a:['ژاپن','چین','کره','تایلند'],c:2},
    {q:'🎵 ویولن چند سیم؟',a:['3','4','5','6'],c:1},
    {q:'🎵 پیانو کلاویه؟',a:['76','82','88','92'],c:2},
    {q:'🎵 سمفونی نهم؟',a:['موتسارت','بتهوون','باخ','شومان'],c:1},
    {q:'🎵 رپ از کجا؟',a:['آمریکا','انگلیس','آلمان','فرانسه'],c:0},
    {q:'🎵 هارمونیکا چیست؟',a:['بادی','زهی','کوبه‌ای','الکترونیک'],c:0},
    {q:'🎵 اولین آهنگ میلیاردی؟',a:['Shape of You','Blinding Lights','Dance Monkey','Despacito'],c:1},
    {q:'🎵 گوگوش خواننده؟',a:['پاپ','راک','کلاسیک','رپ'],c:0},
  ],
  literature: [
    {q:'📖 شاهنامه کی؟',a:['مولوی','فردوسی','حافظ','سعدی'],c:1},
    {q:'📖 غزلیات کی؟',a:['فردوسی','مولوی','حافظ','سعدی'],c:2},
    {q:'📖 مثنوی کی؟',a:['حافظ','مولوی','سعدی','خیام'],c:1},
    {q:'📖 گلستان کی؟',a:['حافظ','مولوی','سعدی','فردوسی'],c:2},
    {q:'📖 رباعیات کی؟',a:['حافظ','مولوی','سعدی','خیام'],c:3},
    {q:'📖 دیوان شمس کی؟',a:['حافظ','مولوی','سعدی','خیام'],c:1},
    {q:'📖 هملت کی؟',a:['دیکنز','شکسپیر','بایرون','شلی'],c:1},
    {q:'📖 ۱۹۸۴ کی؟',a:['هکسلی','ارول','کافکا','کامو'],c:1},
    {q:'📖 بوف کور؟',a:['هدایت','آلاحمد','چوبک','دشتی'],c:0},
    {q:'📖 سووشون؟',a:['هدایت','آلاحمد','دانشور','گلشیری'],c:2},
    {q:'📖 شازده کوچولو؟',a:['هوگو','اگزوپری','کامو','سارتر'],c:1},
    {q:'📖 حافظ اهل؟',a:['اصفهان','شیراز','تبریز','تهران'],c:1},
    {q:'📖 مولانا اهل؟',a:['تهران','بلخ','شیراز','اصفهان'],c:1},
    {q:'📖 سعدی اهل؟',a:['تهران','اصفهان','شیراز','تبریز'],c:2},
    {q:'📖 خیام اهل؟',a:['تهران','اصفهان','نیشابور','شیراز'],c:2},
    {q:'📖 شکسپیر اهل؟',a:['آمریکا','فرانسه','انگلیس','آلمان'],c:2},
    {q:'📖 تولستوی اهل؟',a:['فرانسه','آلمان','روسیه','ایتالیا'],c:2},
    {q:'📖 کافکا اهل؟',a:['آلمان','اتریش','لهستان','چک'],c:3},
    {q:'📖 هوگو اهل؟',a:['ایتالیا','اسپانیا','فرانسه','آلمان'],c:2},
    {q:'📖 کلیک و دایه‌دار؟',a:['کافکا','داستایفسکی','تولستوی','هاینریش'],c:3},
  ],
  technology: [
    {q:'💻 بنیانگذار اپل؟',a:['گیتس','جابز','ماسک','بزوس'],c:1},
    {q:'💻 بنیانگذار مایکروسافت؟',a:['جابز','گیتس','ماسک','زاکربرگ'],c:1},
    {q:'💻 بنیانگذار فیسبوک؟',a:['گیتس','جابز','ماسک','زاکربرگ'],c:3},
    {q:'💻 بنیانگذار تسلا؟',a:['گیتس','جابز','ماسک','بزوس'],c:2},
    {q:'💻 اولین آیفون؟',a:['2005','2006','2007','2008'],c:2},
    {q:'💻 مالک X؟',a:['دورسی','ماسک','زاکربرگ','بزوس'],c:1},
    {q:'💻 اندروید از؟',a:['اپل','مایکروسافت','گوگل','سامسونگ'],c:2},
    {q:'💻 ChatGPT از؟',a:['گوگل','OpenAI','مایکروسافت','متا'],c:1},
    {q:'💻 اولین کامپیوتر؟',a:['UNIVAC','ENIAC','IBM','Apple'],c:1},
    {q:'💻 مالک اینستاگرام؟',a:['توییتر','گوگل','متا','اپل'],c:2},
    {q:'💻 HTML مخفف؟',a:['HyperText Markup','High Tech','Home Tool','None'],c:0},
    {q:'💻 پایتون از کی؟',a:['تورولدز','گویدو','گاسلینگ','آیک'],c:1},
    {q:'💻 لینوکس از کی؟',a:['گیتس','تورولدز','جابز','زاکربرگ'],c:1},
    {q:'💻 اولین وب‌سایت؟',a:['1989','1991','1993','1995'],c:1},
    {q:'💻 بیت‌کوین از کی؟',a:['ماسک','ناکاموتو','بوترین','زاکربرگ'],c:1},
    {q:'💻 جاوا از کی؟',a:['گویدو','گاسلینگ','آیک','تورولدز'],c:1},
    {q:'💻 مالک واتساپ؟',a:['گوگل','متا','توییتر','مایکروسافت'],c:1},
    {q:'💻 مالک یوتیوب؟',a:['متا','گوگل','آمازون','اپل'],c:1},
    {q:'💻 مالک آمازون؟',a:['ماسک','بزوس','گیتس','جابز'],c:1},
    {q:'💻 اولین گوشی هوشمند؟',a:['آیفون','بلک‌بری','نوکیا','سامسونگ'],c:1},
  ],
};

const CAT = {
  history:'🏛️ تاریخ',geography:'🌍 جغرافیا',science:'🔬 علوم',
  food:'🍕 غذا',sports:'⚽ ورزش',movies:'🎬 فیلم',
  music:'🎵 موسیقی',literature:'📖 ادبیات',technology:'💻 تکنولوژی'
};

// ============================================================
// TRUTH & DARE
// ============================================================
const TRUTH = [
  'آخرین بار کی گریه کردی؟',
  'بزرگترین دروغی که گفتی چی بود؟',
  'از کی مخفیانه خوشت میاد؟',
  'بدترین عادتت چیه؟',
  'آخرین بار کی دزدی کردی؟ (حتی کوچیک)',
  'بزرگترین ترست چیه؟',
  'اگه یه روز نامرئی میشدی چیکار میکردی؟',
  'بدترین غذایی که خوردی چی بود؟',
  'آخرین پیامی که پاک کردی چی بود؟',
  'از چه چیزی خجالت میکشی؟',
  'اگه یه آرزو داشتی چی بود؟',
  'بزرگترین اشتباه زندگیت؟',
  'کی آخرین بار بهت خیانت کرد؟',
  'مخفیانه چه چیزی رو گوگل میکنی؟',
  'اگه فقط ۲۴ ساعت وقت داشتی چیکار میکردی؟',
  'بزرگترین راز زندگیت چیه؟',
  'از کدوم یکی از دوستات خوشت نمیاد؟',
  'آخرین بار کی از دست کسی عصبانی شدی؟',
  'بزرگترین حماقتی که کردی؟',
  'اگه بتونی یه نفر رو حذف کنی کیه؟',
];

const DARE = [
  'یه صدا حیوانی دربیار! 🐵',
  'عکس پروفایلت رو عوض کن! 📸',
  'یه جوک بگو! 😂',
  'یه آهنگ بخون! 🎤',
  '۱۰ تا شنا برو! 💪',
  'یه استوری بذار و اسم یکی رو تگ کن! 📱',
  'به آخرین نفری که چت کردی بگو دوستت دارم! ❤️',
  'یه عکس مسخره بفرست! 🤪',
  '۳۰ ثانیه سکوت کن! 🤫',
  'یه لطیفه بگو! 😄',
  'اسم ۵ تا کشور رو سریع بگو! 🌍',
  'یه رقص کوچیک بکن! 💃',
  'به بابات زنگ بزن بگو دوستت دارم! 📞',
  'یه شعر بخون! 📝',
  'عکس غذای آخرت رو بفرست! 🍕',
  '۱۰ ثانیه رو یه پا وایسا! 🦩',
  'اسکرین‌شات آخرین چتت رو بفرست! 💬',
  'یه تقلید صدا بکن! 🎭',
  'اسم ۳ تا حیوان بگو که با "م" شروع بشن! 🐒',
  'یه داستان ۳۰ ثانیه‌ای بگو! 📖',
];

// ============================================================
// INLINE HANDLER
// ============================================================
async function onInline(iq, env) {
  const n = iq.from.first_name || 'بازیکن';
  const mk = (id, t, d, mode, icon) => ({
    type: 'article', id, title: icon + ' ' + t, description: d,
    input_message_content: {
      message_text:
        '━━━━━━━━━━━━━━━━━━━\n' +
        icon + ' <b>' + t + '</b>\n' +
        '━━━━━━━━━━━━━━━━━━━\n\n' +
        '👤 سازنده: <b>' + n + '</b>\n\n' +
        '━━━━━━━━━━━━━━━━━━━\n\n' +
        '🎮 <b>پایه‌ام رو بزن!</b>',
      parse_mode: 'HTML'
    },
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎮 پایه‌ام! (1 نفر)', callback_data: 'j_' + mode, style: 'success' }],
        [{ text: '🚀 شروع!', callback_data: 'go', style: 'primary' }],
        [{ text: '❌ لغو', callback_data: 'cancel', style: 'danger' }]
      ]
    }
  });

  await tg(env, 'answerInlineQuery', {
    inline_query_id: iq.id,
    results: [
      mk('q', 'کوئیز', 'بازی سوال و جواب چند نفره', 'quiz', '🎯'),
      mk('t', 'جرأت یا حقیقت', 'بازی جرأت و حقیقت', 'truth', '🎲'),
      mk('w', 'حدس کلمه', 'حدس بزن کلمه چیه', 'word', '📝'),
      mk('s', 'سریع‌ترین', 'کی سریعتر جواب میده؟', 'speed', '⚡'),
    ],
    cache_time: 0, is_personal: true
  });
}

// ============================================================
// MESSAGE HANDLER
// ============================================================
async function onMsg(msg, env) {
  const cid = msg.chat.id;
  const t = (msg.text || '').trim();
  const n = msg.from.first_name || 'بازیکن';
  const isG = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  if (t === '/start' || t.startsWith('/start@')) {
    if (isG) {
      await tg(env, 'sendMessage', { chat_id: cid, parse_mode: 'HTML',
        text: '━━━━━━━━━━━━━━━━━━━\n🎮 <b>بازی‌های گروهی</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
        '📌 بنویس: <code>@Gamebotsbssksbot</code>\n\n' +
        '🎯 کوئیز | 🎲 جرأت یا حقیقت\n📝 حدس کلمه | ⚡ سریع‌ترین\n\n' +
        '━━━━━━━━━━━━━━━━━━━'
      });
    } else {
      await tg(env, 'sendMessage', { chat_id: cid, parse_mode: 'HTML',
        text: '━━━━━━━━━━━━━━━━━━━\n🎮 <b>بازی‌های گروهی</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
        'من رو به گروهت اد کن و با دوستات بازی کن!\n\n' +
        '🎯 کوئیز | 🎲 جرأت یا حقیقت\n📝 حدس کلمه | ⚡ سریع‌ترین\n\n' +
        '━━━━━━━━━━━━━━━━━━━',
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ اضافه کردن به گروه', url: 'https://t.me/Gamebotsbssksbot?startgroup=true' }],
            [{ text: '🎮 بازی‌ها رو ببین', switch_inline_query: '' }]
          ]
        }
      });
    }
    return;
  }

  if (t === '/quiz' || t.startsWith('/quiz@')) {
    if (!isG) { await tg(env, 'sendMessage', { chat_id: cid, text: '⚠️ فقط تو گروه!', parse_mode: 'HTML' }); return; }
    const gg = g(cid);
    if (gg.st === 'playing') { await tg(env, 'sendMessage', { chat_id: cid, text: '⚠️ بازی در حال اجراست! اول /stop بزن.', parse_mode: 'HTML' }); return; }

    const ng = fresh(cid);
    ng.st = 'setup';
    ng.host = msg.from.id;
    ng.hostName = n;
    G.set(cid, ng);

    const m = await tg(env, 'sendMessage', {
      chat_id: cid, parse_mode: 'HTML',
      text: '━━━━━━━━━━━━━━━━━━━\n🎮 <b>بازی جدید</b>\n━━━━━━━━━━━━━━━━━━━\n\n👤 سازنده: <b>' + n + '</b>\n\n🎯 نوع بازی:',
      reply_markup: { inline_keyboard: [
        [{ text: '🎯 کوئیز', callback_data: 'mode_quiz' }, { text: '🎲 جرأت یا حقیقت', callback_data: 'mode_truth' }],
        [{ text: '📝 حدس کلمه', callback_data: 'mode_word' }, { text: '⚡ سریع‌ترین', callback_data: 'mode_speed' }]
      ]}
    });
    ng.msg = m?.message_id;
    return;
  }

  if (t === '/stop' || t.startsWith('/stop@')) {
    const gg = g(cid);
    if (gg.st !== 'playing' && gg.st !== 'waiting' && gg.st !== 'setup') { await tg(env, 'sendMessage', { chat_id: cid, text: '⚠️ بازی فعالی نیست.', parse_mode: 'HTML' }); return; }
    if (gg.th) clearTimeout(gg.th);
    gg.st = 'idle';
    if (gg.msg) await edit(env, cid, gg.msg, '🛑 <b>بازی متوقف شد.</b>');
    return;
  }

  if (t === '/score' || t.startsWith('/score@')) {
    const gg = g(cid);
    if (!gg.players.size) { await tg(env, 'sendMessage', { chat_id: cid, text: '📊 هنوز کسی بازی نکرده!', parse_mode: 'HTML' }); return; }
    await showScore(env, cid, gg);
    return;
  }

  if (t === '/help' || t.startsWith('/help@')) {
    await tg(env, 'sendMessage', { chat_id: cid, parse_mode: 'HTML',
      text: '🎮 <b>راهنما</b>\n\n🎯 کوئیز — سوال و جواب\n🎲 جرأت یا حقیقت\n📝 حدس کلمه\n⚡ سریع‌ترین\n\n📌 <code>@Gamebotsbssksbot</code> رو تو گپ تایپ کن\n\n/quiz — بازی جدید\n/score — امتیازات\n/stop — توقف'
    });
    return;
  }

  // Handle word guess text input
  if (isG && msg.reply_to_message) {
    const gg = g(cid);
    if (gg.st === 'playing' && gg.mode === 'word' && gg.cur) {
      const guess = t.toLowerCase();
      const word = gg.cur.word.toLowerCase();
      if (!gg.ans.has(msg.from.id)) {
        gg.ans.set(msg.from.id, { ans: guess, time: 0, ok: guess === word });
        if (!gg.players.has(msg.from.id)) gg.players.set(msg.from.id, pl(msg.from.first_name || 'بازیکن'));
        const p = gg.players.get(msg.from.id);
        if (guess === word) {
          p.score += 20;
          p.ok++;
          p.str++;
          p.best = Math.max(p.best, p.str);
          await tg(env, 'sendMessage', { chat_id: cid, text: '✅ <b>' + msg.from.first_name + '</b> درست حدس زد! 🎉', parse_mode: 'HTML' });
        } else {
          p.bad++;
          p.str = 0;
        }
      }
    }
  }
}

// ============================================================
// CALLBACK HANDLER
// ============================================================
async function onCb(cb, env) {
  const cid = cb.message.chat.id;
  const d = cb.data;
  const uid = cb.from.id;
  const n = cb.from.first_name || 'بازیکن';
  const mid = cb.message.message_id;
  const gg = g(cid);

  // ===== INLINE JOIN =====
  if (d.startsWith('j_')) {
    const mode = d.replace('j_', '');
    if (gg.st === 'playing') { await cb(env, cb.id, '⚠️ بازی در حال اجراست!', true); return; }

    const ng = fresh(cid);
    ng.st = 'waiting';
    ng.host = uid;
    ng.hostName = n;
    ng.mode = mode;
    ng.players.set(uid, pl(n));
    ng.msg = mid;
    G.set(cid, ng);

    const icons = { quiz: '🎯', truth: '🎲', word: '📝', speed: '⚡' };
    const names = { quiz: 'کوئیز', truth: 'جرأت یا حقیقت', word: 'حدس کلمه', speed: 'سریع‌ترین' };

    if (mode === 'quiz') {
      // Show category selection for quiz
      ng.st = 'setup';
      await edit(env, cid, mid,
        '━━━━━━━━━━━━━━━━━━━\n🎯 <b>کوئیز</b>\n━━━━━━━━━━━━━━━━━━━\n\n👤 سازنده: <b>' + n + '</b>\n\n📦 ژانر:',
        { inline_keyboard: [
          [{ text: '🏛️ تاریخ', callback_data: 'sc_history' }, { text: '🌍 جغرافیا', callback_data: 'sc_geography' }],
          [{ text: '🔬 علوم', callback_data: 'sc_science' }, { text: '🍕 غذا', callback_data: 'sc_food' }],
          [{ text: '⚽ ورزش', callback_data: 'sc_sports' }, { text: '🎬 فیلم', callback_data: 'sc_movies' }],
          [{ text: '🎵 موسیقی', callback_data: 'sc_music' }, { text: '📖 ادبیات', callback_data: 'sc_literature' }],
          [{ text: '💻 تکنولوژی', callback_data: 'sc_technology' }],
          [{ text: '🎯 همه', callback_data: 'sc_all', style: 'primary' }]
        ]}
      );
    } else {
      // Truth/Word/Speed: go directly to lobby
      ng.st = 'waiting';
      await edit(env, cid, mid,
        lobbyText(icons[mode] + ' ' + names[mode], ng.players),
        lobbyKb(ng.players)
      );
    }
    await cb(env, cb.id, '✅ ' + n + ' وارد بازی شد!');
    return;
  }

  // ===== MODE SELECT (from /quiz) =====
  if (d.startsWith('mode_')) {
    if (gg.st !== 'setup') { await cb(env, cb.id, '⚠️ /quiz بزنید'); return; }
    gg.mode = d.replace('mode_', '');
    if (gg.mode === 'quiz') {
      await edit(env, cid, mid,
        '━━━━━━━━━━━━━━━━━━━\n🎯 <b>کوئیز</b>\n━━━━━━━━━━━━━━━━━━━\n\n📦 ژانر:',
        { inline_keyboard: [
          [{ text: '🏛️ تاریخ', callback_data: 'sc_history' }, { text: '🌍 جغرافیا', callback_data: 'sc_geography' }],
          [{ text: '🔬 علوم', callback_data: 'sc_science' }, { text: '🍕 غذا', callback_data: 'sc_food' }],
          [{ text: '⚽ ورزش', callback_data: 'sc_sports' }, { text: '🎬 فیلم', callback_data: 'sc_movies' }],
          [{ text: '🎵 موسیقی', callback_data: 'sc_music' }, { text: '📖 ادبیات', callback_data: 'sc_literature' }],
          [{ text: '💻 تکنولوژی', callback_data: 'sc_technology' }],
          [{ text: '🎯 همه', callback_data: 'sc_all', style: 'primary' }]
        ]}
      );
    } else {
      gg.st = 'waiting';
      gg.players.set(uid, pl(n));
      const icons = { truth: '🎲', word: '📝', speed: '⚡' };
      const names = { truth: 'جرأت یا حقیقت', word: 'حدس کلمه', speed: 'سریع‌ترین' };
      await edit(env, cid, mid,
        lobbyText(icons[gg.mode] + ' ' + names[gg.mode], gg.players),
        lobbyKb(gg.players)
      );
    }
    await cb(env, cb.id);
    return;
  }

  // ===== CATEGORY SELECT =====
  if (d.startsWith('sc_')) {
    if (gg.st !== 'setup') { await cb(env, cb.id, '⚠️ /quiz بزنید'); return; }
    gg.cat = d.replace('sc_', '');
    gg.st = 'setup';
    const cn = gg.cat === 'all' ? 'همه' : (CAT[gg.cat] || gg.cat);
    await edit(env, cid, mid,
      '━━━━━━━━━━━━━━━━━━━\n🎯 <b>کوئیز</b>\n━━━━━━━━━━━━━━━━━━━\n\n📦 ژانر: <b>' + cn + '</b>\n\n📊 تعداد سوال:',
      { inline_keyboard: [
        [{ text: '5 ⚡', callback_data: 'sr_5' }, { text: '10 🎯', callback_data: 'sr_10' }],
        [{ text: '15 🔥', callback_data: 'sr_15' }, { text: '20 💎', callback_data: 'sr_20' }]
      ]}
    );
    await cb(env, cb.id);
    return;
  }

  // ===== ROUNDS SELECT =====
  if (d.startsWith('sr_')) {
    if (gg.st !== 'setup') { await cb(env, cb.id, '⚠️ /quiz بزنید'); return; }
    gg.rounds = parseInt(d.replace('sr_', ''));
    const cn = gg.cat === 'all' ? 'همه' : (CAT[gg.cat] || gg.cat);
    await edit(env, cid, mid,
      '━━━━━━━━━━━━━━━━━━━\n🎯 <b>کوئیز</b>\n━━━━━━━━━━━━━━━━━━━\n\n📦 ژانر: <b>' + cn + '</b>\n📊 سوال: <b>' + gg.rounds + '</b>\n\n⏰ تایمر:',
      { inline_keyboard: [
        [{ text: '10s ⚡', callback_data: 'st_10' }, { text: '15s 🎯', callback_data: 'st_15' }],
        [{ text: '20s 🔥', callback_data: 'st_20' }, { text: '30s 💎', callback_data: 'st_30' }]
      ]}
    );
    await cb(env, cb.id);
    return;
  }

  // ===== TIMER SELECT → LOBBY =====
  if (d.startsWith('st_')) {
    if (gg.st !== 'setup') { await cb(env, cb.id, '⚠️ /quiz بزنید'); return; }
    gg.timer = parseInt(d.replace('st_', ''));
    gg.st = 'waiting';
    gg.players.set(uid, pl(n));
    await edit(env, cid, mid,
      lobbyText('🎯 کوئیز', gg.players),
      lobbyKb(gg.players)
    );
    await cb(env, cb.id, '✅ تنظیمات ذخیره شد!');
    return;
  }

  // ===== JOIN =====
  if (d === 'join') {
    if (gg.st !== 'waiting') { await cb(env, cb.id, '⚠️ بازی در انتظار نیست!'); return; }
    if (gg.players.has(uid)) { await cb(env, cb.id, 'قبلاً پایه زدی!'); return; }
    gg.players.set(uid, pl(n));
    const icons = { quiz: '🎯', truth: '🎲', word: '📝', speed: '⚡' };
    const names = { quiz: 'کوئیز', truth: 'جرأت یا حقیقت', word: 'حدس کلمه', speed: 'سریع‌ترین' };
    await edit(env, cid, gg.msg,
      lobbyText(icons[gg.mode] + ' ' + names[gg.mode], gg.players),
      lobbyKb(gg.players)
    );
    await cb(env, cb.id, '✅ ' + n + ' اضافه شد!');
    return;
  }

  // ===== CANCEL =====
  if (d === 'cancel') {
    if (uid !== gg.host) { await cb(env, cb.id, 'فقط سازنده!', true); return; }
    if (gg.th) clearTimeout(gg.th);
    gg.st = 'idle';
    await edit(env, cid, mid, '❌ <b>بازی لغو شد.</b>');
    await cb(env, cb.id, '❌ لغو شد');
    return;
  }

  // ===== GO =====
  if (d === 'go') {
    if (uid !== gg.host) { await cb(env, cb.id, 'فقط سازنده!', true); return; }
    if (gg.players.size < 2) { await cb(env, cb.id, 'حداقل 2 نفر!', true); return; }
    if (gg.st !== 'waiting') { await cb(env, cb.id, '⚠️ /quiz بزنید', true); return; }

    gg.st = 'playing';

    if (gg.mode === 'quiz') {
      gg.pool = mkPool(gg.cat);
      gg.idx = 0;
      gg.rounds = Math.min(gg.rounds, gg.pool.length);
      await nextQ(env, cid, gg);
    } else if (gg.mode === 'truth') {
      await nextTruth(env, cid, gg);
    } else if (gg.mode === 'word') {
      await nextWord(env, cid, gg);
    } else if (gg.mode === 'speed') {
      await nextSpeed(env, cid, gg);
    }

    await cb(env, cb.id, '🚀 شروع!');
    return;
  }

  // ===== QUIZ ANSWER =====
  if (d.startsWith('a_')) {
    if (gg.st !== 'playing' || !gg.cur) { await cb(env, cb.id, '⚠️'); return; }
    const parts = d.split('_');
    const chosen = parseInt(parts[2]);
    if (gg.ans.has(uid)) { await cb(env, cb.id, 'قبلاً جواب دادی!', true); return; }
    if (!gg.players.has(uid)) gg.players.set(uid, pl(n));
    const p = gg.players.get(uid);
    const timeSec = Math.floor((Date.now() - gg.cur.time) / 1000);
    const ok = chosen === gg.cur.c;
    gg.ans.set(uid, { ans: chosen, time: timeSec, ok });
    if (ok) {
      const tb = Math.max(1, gg.timer - timeSec);
      const sb = Math.min(p.str * 2, 10);
      const pts = tb + sb + 5;
      p.score += pts; p.ok++; p.str++; p.best = Math.max(p.best, p.str);
      await cb(env, cb.id, '✅ درست! +' + pts + ' (' + timeSec + 's)');
    } else {
      p.bad++; p.str = 0;
      await cb(env, cb.id, '❌ اشتباه!');
    }
    if (gg.ans.size >= gg.players.size) {
      if (gg.th) clearTimeout(gg.th);
      gg.idx++;
      if (gg.idx >= gg.rounds) { gg.st = 'finished'; await showFinal(env, cid, gg); }
      else await nextQ(env, cid, gg);
    }
    return;
  }

  // ===== TRUTH ANSWER =====
  if (d === 'truth_next') {
    if (gg.st !== 'playing') { await cb(env, cb.id, '⚠️'); return; }
    gg.idx++;
    if (gg.idx >= gg.rounds) { gg.st = 'finished'; await showFinal(env, cid, gg); }
    else await nextTruth(env, cid, gg);
    await cb(env, cb.id);
    return;
  }

  // ===== SPEED ANSWER =====
  if (d.startsWith('sp_')) {
    if (gg.st !== 'playing' || !gg.cur) { await cb(env, cb.id, '⚠️'); return; }
    const chosen = parseInt(d.split('_')[1]);
    if (!gg.players.has(uid)) gg.players.set(uid, pl(n));
    const p = gg.players.get(uid);
    const ok = chosen === gg.cur.c;
    if (ok) {
      p.score += 5; p.ok++; p.str++; p.best = Math.max(p.best, p.str);
      await cb(env, cb.id, '✅ +5');
    } else {
      p.bad++; p.str = 0;
      await cb(env, cb.id, '❌');
    }
    // Speed: immediately next question
    gg.idx++;
    if (gg.idx >= gg.rounds) { gg.st = 'finished'; if (gg.th) clearTimeout(gg.th); await showFinal(env, cid, gg); }
    else await nextSpeed(env, cid, gg);
    return;
  }

  // ===== REPORT =====
  if (d.startsWith('report_')) {
    await cb(env, cb.id, '🔴 گزارش ثبت شد. ممنون!', true);
    return;
  }

  // ===== NEW GAME =====
  if (d === 'new_game') {
    const ng = fresh(cid);
    ng.st = 'setup';
    ng.host = uid;
    ng.hostName = n;
    ng.msg = mid;
    G.set(cid, ng);
    await edit(env, cid, mid,
      '━━━━━━━━━━━━━━━━━━━\n🎮 <b>بازی جدید</b>\n━━━━━━━━━━━━━━━━━━━\n\n👤 سازنده: <b>' + n + '</b>\n\n🎯 نوع بازی:',
      { inline_keyboard: [
        [{ text: '🎯 کوئیز', callback_data: 'mode_quiz' }, { text: '🎲 جرأت یا حقیقت', callback_data: 'mode_truth' }],
        [{ text: '📝 حدس کلمه', callback_data: 'mode_word' }, { text: '⚡ سریع‌ترین', callback_data: 'mode_speed' }]
      ]}
    );
    await cb(env, cb.id);
    return;
  }
}

// ============================================================
// GAME FUNCTIONS
// ============================================================
function lobbyText(title, players) {
  let list = '';
  players.forEach(p => { list += '  👤 ' + p.name + '\n'; });
  return '━━━━━━━━━━━━━━━━━━━\n' +
    title + '\n' +
    '━━━━━━━━━━━━━━━━━━━\n\n' +
    '👥 <b>بازیکنان (' + players.size + ' نفر):</b>\n' + list +
    '━━━━━━━━━━━━━━━━━━━\n\n' +
    '🎮 <b>پایه‌ام رو بزن!</b>';
}

function lobbyKb(players) {
  return { inline_keyboard: [
    [{ text: '🎮 پایه‌ام! (' + players.size + ' نفر)', callback_data: 'join', style: 'success' }],
    [{ text: '🚀 شروع!', callback_data: 'go', style: 'primary' }],
    [{ text: '❌ لغو', callback_data: 'cancel', style: 'danger' }]
  ]};
}

// ===== QUIZ =====
async function nextQ(env, cid, gg) {
  if (gg.idx >= gg.pool.length || gg.idx >= gg.rounds) {
    gg.st = 'finished';
    await showFinal(env, cid, gg);
    return;
  }
  const q = gg.pool[gg.idx];
  const e = ['🇦', '🇧', '🇨', '🇩'];
  gg.cur = { ...q, time: Date.now() };
  gg.ans = new Map();

  const cn = CAT[q.cat] || q.cat;
  await edit(env, cid, gg.msg,
    '━━━━━━━━━━━━━━━━━━━\n' +
    '🎯 <b>سوال ' + (gg.idx + 1) + '/' + gg.rounds + '</b>\n' +
    '📦 ' + cn + ' | ⏰ ' + gg.timer + 's\n' +
    '━━━━━━━━━━━━━━━━━━━\n\n' +
    q.q + '\n\n' +
    e[0] + ' ' + q.a[0] + '\n' +
    e[1] + ' ' + q.a[1] + '\n' +
    e[2] + ' ' + q.a[2] + '\n' +
    e[3] + ' ' + q.a[3] + '\n\n' +
    '━━━━━━━━━━━━━━━━━━━',
    { inline_keyboard: [
      [{ text: e[0] + ' ' + q.a[0], callback_data: 'a_x_0', style: 'primary' },
       { text: e[1] + ' ' + q.a[1], callback_data: 'a_x_1', style: 'primary' }],
      [{ text: e[2] + ' ' + q.a[2], callback_data: 'a_x_2', style: 'primary' },
       { text: e[3] + ' ' + q.a[3], callback_data: 'a_x_3', style: 'primary' }]
    ]}
  );

  if (gg.th) clearTimeout(gg.th);
  gg.th = setTimeout(async () => {
    if (gg.st !== 'playing') return;
    gg.idx++;
    if (gg.idx >= gg.rounds) { gg.st = 'finished'; await showFinal(env, cid, gg); }
    else await nextQ(env, cid, gg);
  }, gg.timer * 1000);
}

// ===== TRUTH OR DARE =====
async function nextTruth(env, cid, gg) {
  const isTruth = Math.random() < 0.5;
  const pool = isTruth ? TRUTH : DARE;
  const item = pool[Math.floor(Math.random() * pool.length)];
  const pList = [...gg.players.values()];
  const target = pList[Math.floor(Math.random() * pList.length)];

  gg.cur = { isTruth, item, target: target.name };
  gg.idx = gg.idx || 0;

  await edit(env, cid, gg.msg,
    '━━━━━━━━━━━━━━━━━━━\n' +
    '🎲 <b>جرأت یا حقیقت (' + (gg.idx + 1) + '/' + gg.rounds + ')</b>\n' +
    '━━━━━━━━━━━━━━━━━━━\n\n' +
    '👤 نوبت: <b>' + target.name + '</b>\n\n' +
    (isTruth ? '💭 <b>حقیقت:</b>' : '🔥 <b>جرأت:</b>') + '\n' +
    item + '\n\n' +
    '━━━━━━━━━━━━━━━━━━━',
    { inline_keyboard: [
      [{ text: '➡️ بعدی', callback_data: 'truth_next', style: 'primary' }],
      [{ text: '🏁 پایان بازی', callback_data: 'cancel', style: 'danger' }]
    ]}
  );
}

// ===== WORD GUESS =====
const WORDS = ['قهوه','ماهی','آسمان','درخت','کتاب','پنجره','خورشید','گل‌ها','باران','کوهستان',
  'آتیش','دریا','ستاره','بادبادک','پروانه','سیب‌زمینی','ترنج','زعفران','فلافل','کوکو'];

async function nextWord(env, cid, gg) {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const hint = word[0] + ' ' + '_ '.repeat(word.length - 1).trim();
  gg.cur = { word, time: Date.now() };
  gg.ans = new Map();

  // Show first letter + number of letters
  const rows = [];
  const letters = 'ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی';
  for (let i = 0; i < letters.length; i += 6) {
    const row = [];
    for (let j = i; j < i + 6 && j < letters.length; j++) {
      row.push({ text: letters[j], callback_data: 'wl_' + letters[j] });
    }
    rows.push(row);
  }

  await edit(env, cid, gg.msg,
    '━━━━━━━━━━━━━━━━━━━\n' +
    '📝 <b>حدس کلمه (' + (gg.idx + 1) + '/' + gg.rounds + ')</b>\n' +
    '━━━━━━━━━━━━━━━━━━━\n\n' +
    'کلمه ' + word.length + ' حرفی\n' +
    'حرف اول: <b>' + word[0] + '</b>\n\n' +
    '<code>' + hint + '</code>\n\n' +
    '━━━━━━━━━━━━━━━━━━━',
    { inline_keyboard: rows }
  );

  if (gg.th) clearTimeout(gg.th);
  gg.th = setTimeout(async () => {
    if (gg.st !== 'playing') return;
    gg.idx++;
    if (gg.idx >= gg.rounds) { gg.st = 'finished'; await showFinal(env, cid, gg); }
    else await nextWord(env, cid, gg);
  }, 30000);
}

// ===== SPEED ROUND =====
async function nextSpeed(env, cid, gg) {
  if (gg.idx >= gg.rounds) { gg.st = 'finished'; if (gg.th) clearTimeout(gg.th); await showFinal(env, cid, gg); return; }
  if (!gg.pool.length) {
    gg.pool = mkPool('all');
    gg.idx = 0;
  }
  const q = gg.pool[gg.idx % gg.pool.length];
  const e = ['🇦', '🇧', '🇨', '🇩'];
  gg.cur = { ...q, time: Date.now() };

  await edit(env, cid, gg.msg,
    '━━━━━━━━━━━━━━━━━━━\n' +
    '⚡ <b>سریع‌ترین (' + (gg.idx + 1) + '/' + gg.rounds + ')</b>\n' +
    '━━━━━━━━━━━━━━━━━━━\n\n' +
    q.q + '\n\n' +
    e[0] + ' ' + q.a[0] + '\n' +
    e[1] + ' ' + q.a[1] + '\n' +
    e[2] + ' ' + q.a[2] + '\n' +
    e[3] + ' ' + q.a[3] + '\n\n' +
    '━━━━━━━━━━━━━━━━━━━',
    { inline_keyboard: [
      [{ text: e[0] + ' ' + q.a[0], callback_data: 'sp_0', style: 'primary' },
       { text: e[1] + ' ' + q.a[1], callback_data: 'sp_1', style: 'primary' }],
      [{ text: e[2] + ' ' + q.a[2], callback_data: 'sp_2', style: 'primary' },
       { text: e[3] + ' ' + q.a[3], callback_data: 'sp_3', style: 'primary' }]
    ]}
  );
}

// ===== SCOREBOARD =====
async function showScore(env, cid, gg) {
  const p = [...gg.players.entries()].sort((a, b) => b[1].score - a[1].score);
  const m = ['🥇', '🥈', '🥉'];
  let t = '━━━━━━━━━━━━━━━━━━━\n📊 <b>امتیازات</b>\n━━━━━━━━━━━━━━━━━━━\n\n';
  p.forEach(([id, pl], i) => {
    t += (m[i] || '  ' + (i + 1) + '.') + ' <b>' + pl.name + '</b> — 🏆' + pl.score + ' ✅' + pl.ok + ' ❌' + pl.bad + ' 🔥' + pl.best + '\n';
  });
  t += '\n━━━━━━━━━━━━━━━━━━━';
  await tg(env, 'sendMessage', { chat_id: cid, text: t, parse_mode: 'HTML' });
}

// ===== FINAL LEADERBOARD =====
async function showFinal(env, cid, gg) {
  if (gg.th) { clearTimeout(gg.th); gg.th = null; }
  const p = [...gg.players.entries()].sort((a, b) => b[1].score - a[1].score);
  if (!p.length) { gg.st = 'idle'; return; }

  const w = p[0][1];
  let t = '━━━━━━━━━━━━━━━━━━━\n🏆 <b>بازی تمام شد!</b>\n━━━━━━━━━━━━━━━━━━━\n\n';
  t += '🎉 <b>برنده: ' + w.name + '</b>\n';
  t += '🏆 ' + w.score + ' | ✅ ' + w.ok + ' | ❌ ' + w.bad + ' | 🔥 ' + w.best + '\n\n';
  t += '━━━━━━━━━━━━━━━━━━━\n📊 <b>رده‌بندی:</b>\n\n';

  const medals = ['🥇', '🥈', '🥉'];
  p.forEach(([id, pl], i) => {
    t += (medals[i] || '  ' + (i + 1) + '.') + ' <b>' + pl.name + '</b>\n';
    t += '    🏆 ' + pl.score + ' | ✅ ' + pl.ok + ' | ❌ ' + pl.bad + ' | 🔥 ' + pl.best + '\n\n';
  });

  t += '━━━━━━━━━━━━━━━━━━━\n🎮 <code>@Gamebotsbssksbot</code>';

  gg.st = 'idle';

  await edit(env, cid, gg.msg, t,
    { inline_keyboard: [[{ text: '🔄 بازی جدید!', callback_data: 'new_game', style: 'primary' }]] }
  );
}
