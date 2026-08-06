// Quiz Bot v5 - Complete Rewrite
// Fixed: question repeats, state machine, timer bugs, 20+ Q per category
// All gameplay via editMessageText on single message

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        if (update.inline_query) await handleInline(update.inline_query, env);
        else if (update.callback_query) await handleCallback(update.callback_query, env);
        else if (update.message) await handleMessage(update.message, env);
        return new Response('OK');
      } catch (e) { return new Response('Error: ' + e.message, { status: 500 }); }
    }
    return new Response('Quiz Bot Active', { status: 200 });
  },
};

// ============================================================
// HELPERS
// ============================================================
async function api(env, method, body) {
  const resp = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const json = await resp.json();
  if (!json.ok) throw new Error('TG API: ' + JSON.stringify(json));
  return json.result;
}

async function editMsg(env, chatId, msgId, text, kb) {
  const body = { chat_id: chatId, message_id: msgId, text, parse_mode: 'HTML' };
  if (kb !== undefined) body.reply_markup = kb;
  try { await api(env, 'editMessageText', body); } catch (e) { /* ignore duplicate */ }
}

async function answerCb(env, id, text, alert) {
  try { await api(env, 'answerCallbackQuery', { callback_query_id: id, text: text || '', show_alert: !!alert }); } catch (e) {}
}

// ============================================================
// GAME STATE (one game per chat, stored in-memory)
// ============================================================
const games = new Map();

function newPlayer(name) {
  return { name, score: 0, correct: 0, wrong: 0, streak: 0, best: 0 };
}

function newGame(chatId) {
  return {
    chatId,
    state: 'idle',         // idle | setup | waiting | playing | finished
    host: 0,
    hostName: '',
    players: new Map(),    // userId -> player
    cat: 'all',
    rounds: 10,
    timer: 15,
    qPool: [],             // shuffled questions for this game
    qIndex: 0,             // current question index
    curQ: null,            // current question object
    answered: new Map(),   // userId -> { ans, time, ok }
    msgId: null,           // THE message we keep editing
    timerHandle: null,
  };
}

function G(chatId) {
  if (!games.has(chatId)) games.set(chatId, newGame(chatId));
  return games.get(chatId);
}

// ============================================================
// QUESTIONS - 20+ per category
// ============================================================
const Q = {
  history: [
    {q:'🏛️ چه کسی تخت جمشید را ساخت؟',a:['کوروش','داریوش','خشایارشا','اردشیر'],c:1},
    {q:'🏛️ سال شروع جنگ جهانی دوم؟',a:['1935','1939','1941','1945'],c:1},
    {q:'🏛️ اولین تمدن بشری کجا بود؟',a:['مصر','بین‌النهرین','هند','چین'],c:1},
    {q:'🏛️ انقلاب فرانسه چه سالی بود؟',a:['1776','1789','1804','1815'],c:1},
    {q:'🏛️ کلمب آمریکا را چه سالی کشف کرد؟',a:['1488','1492','1500','1510'],c:1},
    {q:'🏛️ آخرین شاه ایران؟',a:['رضاشاه','محمدرضا شاه','احمدشاه','ناصرالدین شاه'],c:1},
    {q:'🏛️ پایتخت سلسله صفویه؟',a:['تهران','اصفهان','شیراز','تبریز'],c:1},
    {q:'🏛️ ناپلئون اهل کجا بود؟',a:['ایتالیا','فرانسه','اسپانیا','آلمان'],c:1},
    {q:'🏛️ هیتلر اهل کجا بود؟',a:['آلمان','اتریش','لهستان','مجارستان'],c:1},
    {q:'🏛️ جنگ جهانی اول چه سالی تمام شد؟',a:['1916','1917','1918','1919'],c:2},
    {q:'🏛️ دیوار برلین چه سالی خراب شد؟',a:['1987','1988','1989','1990'],c:2},
    {q:'🏛️ قاره آمریکا چه سالی کشف شد؟',a:['1392','1442','1492','1542'],c:2},
    {q:'🏛️ تمدن روم کجا بود؟',a:['یونان','ایتالیا','مصر','ایران'],c:1},
    {q:'🏛️ امپراتوری مغول کی بود؟',a:['تیمور','چنگیز','کوبلای','باتو'],c:1},
    {q:'🏛️ جنگ سرد بین کی بود؟',a:['آمریکا-چین','آمریکا-شوروی','انگلیس-فرانسه','آلمان-روسیه'],c:1},
    {q:'🏛️ انقلاب اسلامی ایران چه سالی بود؟',a:['1355','1356','1357','1358'],c:2},
    {q:'🏛️ نخستین وزیر مصدق کی بود؟',a:['مصدق','قاسم غنی','دکتر حسین فاطمی',' اللهیار صالح'],c:2},
    {q:'🏛️ سازمان ملل چه سالی تأسیس شد؟',a:['1942','1943','1944','1945'],c:3},
    {q:'🏛️ اولین انسان روی ماه کی بود؟',a:['گاگارین','آرمسترانگ','آلدرین','کالینز'],c:1},
    {q:'🏛️ دیوار چین را کی ساخت؟',a:['کنفوسیوس','شی هوانگ','چنگیز','کوبلای'],c:1},
  ],
  geography: [
    {q:'🌍 بزرگترین کشور جهان؟',a:['آمریکا','چین','کانادا','روسیه'],c:3},
    {q:'🌍 طولانیترین رود جهان؟',a:['آمازون','نیل','می‌سی‌سی‌پی','دانوب'],c:1},
    {q:'🌍 پایتخت ژاپن؟',a:['سئول','پکن','توکیو','بانکوک'],c:2},
    {q:'🌍 بلندترین قله آفریقا؟',a:['کلیمانجارو','کنیا','اتیوپی','آطلس'],c:0},
    {q:'🌍 کوچکترین کشور جهان؟',a:['موناکو','واتیکان','لیختن‌اشتاین','سان مارینو'],c:1},
    {q:'🌍 پایتخت استرالیا؟',a:['سیدنی','ملبورن','کانبرا','بریزبن'],c:2},
    {q:'🌍 بزرگترین جزیره جهان؟',a:['بورنئو','ماداگاسکار','گرینلند','نیوزیلند'],c:2},
    {q:'🌍 پایتخت ترکیه؟',a:['استانبول','آنکارا','ازمیر','آنتالیا'],c:1},
    {q:'🌍 بزرگترین صحرای جهان؟',a:['گبی','صحرای بزرگ','عربستان','آتاکاما'],c:1},
    {q:'🌍 پایتخت فرانسه؟',a:['لندن','برلین','پاریس','رم'],c:2},
    {q:'🌍 پایتخت آلمان؟',a:['مونیخ','هامبورگ','برلین','فرانکفورت'],c:2},
    {q:'🌍 بلندترین قله جهان؟',a:['کی۲','اورست','کانچنجونگا','ماکالو'],c:1},
    {q:'🌍 بزرگترین دریاچه جهان؟',a:['سوپریور','ویکتوریا','خزر','بایکال'],c:2},
    {q:'🌍 پایتخت کانادا؟',a:['تورنتو','ونکوور','مونترال','اوتاوا'],c:3},
    {q:'🌍 رود نیل از کجا می‌گذرد؟',a:['آفریقا','آسیا','اروپا','آمریکا'],c:0},
    {q:'🌍 پایتخت برزیل؟',a:['ریو','سائوپائولو','برازیلیا','سالوادور'],c:2},
    {q:'🌍 پایتخت هند؟',a:['بمبئی','دهلی نو','کلکته','بنگلور'],c:1},
    {q:'🌍 کشور هزار جزیره؟',a:['ژاپن','اندونزی','فیلیپین','مالدیو'],c:1},
    {q:'🌍 پایتخت مصر؟',a:['اسکندریه','قاهره','لوکسور','اسوان'],c:1},
    {q:'🌍 بزرگترین کویر ایران؟',a:['لوت','کویر','دشت کویر','هامون'],c:0},
  ],
  science: [
    {q:'🔬 نماد شیمیایی آب؟',a:['HO','H2O','OH2','H3O'],c:1},
    {q:'🔬 سرعت نور km/s؟',a:['100,000','200,000','300,000','400,000'],c:2},
    {q:'🔬 نزدیکترین ستاره به زمین؟',a:['سیریوس','آلفا قنطورس','خورشید','وگا'],c:2},
    {q:'🔬 گاز غالب جو زمین؟',a:['اکسیژن','نیتروژن','CO2','هیدروژن'],c:1},
    {q:'🔬 بزرگترین سیاره؟',a:['زحل','مشتری','اورانوس','نپتون'],c:1},
    {q:'🔬 چند استخوان در بدن انسان؟',a:['186','206','226','256'],c:1},
    {q:'🔬 الماس از چه ساخته شده؟',a:['سیلیکون','کربن','آهن','طلا'],c:1},
    {q:'🔬 جاذبه را کی کشف کرد؟',a:['اینشتین','نیوتن','گالیله','کپلر'],c:1},
    {q:'🔬 واحد نیرو؟',a:['وات','نیوتن','ژول','پاسکال'],c:1},
    {q:'🔬 فرمول نمک؟',a:['NaCl','KCl','CaCl2','MgCl2'],c:0},
    {q:'🔬 بزرگترین عضو بدن؟',a:['قلب','کبد','پوست','مغز'],c:2},
    {q:'🔬 DNA مخفف چیست؟',a:['Deoxyribonucleic Acid','Dinitrogen Acid','Dynamic Nucleus','None'],c:0},
    {q:'🔬 نزدیکترین سیاره به خورشید؟',a:['زهره','عطارد','مریخ','زمین'],c:1},
    {q:'🔬 بزرگترین اقیانوس؟',a:['اطلس','هند','آرام','منجمد'],c:2},
    {q:'🔬 سخت‌ترین ماده طبیعی؟',a:['طلا','آهن','الماس','تیتانیوم'],c:2},
    {q:'🔬 واحد فشار؟',a:['وات','نیوتن','ژول','پاسکال'],c:3},
    {q:'🔬 نور خورشید چند دقیقه طول می‌کشد؟',a:['5','8','12','15'],c:1},
    {q:'🔬 گلبول قرمز چه رنگی است؟',a:['آبی','سبز','قرمز','زرد'],c:2},
    {q:'🔬 بزرگترین غده بدن؟',a:'تیروئید,کبد,لوزالمعده,طحال'.split(','),c:1},
    {q:'🔬 چند حس داریم؟',a:['4','5','6','7'],c:1},
  ],
  food: [
    {q:'🍕 پیتزا اهل کجاست؟',a:['آمریکا','ایتالیا','فرانسه','اسپانیا'],c:1},
    {q:'🍕 سوشی اهل کجاست؟',a:['چین','کره','ژاپن','تایلند'],c:2},
    {q:'🍕 کباب کوبیده اهل کجاست؟',a:['ترکیه','ایران','عربستان','عراق'],c:1},
    {q:'🍕 قهوه اول از کجا آمد؟',a:['برزیل','کلمبیا','اتیوپی','ترکیه'],c:2},
    {q:'🍕 چای اول از کجا آمد؟',a:['هند','چین','ژاپن','سری‌لانکا'],c:1},
    {q:'🍕 ماده اصلی هوموس؟',a:['لوبیا','نخود','عدس','ماش'],c:1},
    {q:'🍕 زعفران از کجاست؟',a:['هند','ایران','ترکیه','اسپانیا'],c:1},
    {q:'🍕 غذای ملی ایتالیا؟',a:['پیتزا','پاستا','ریزوتو','لازانیا'],c:1},
    {q:'🍕 میوه ملی ایران؟',a:['سیب','انار','انگور','خرما'],c:1},
    {q:'🍕 بستنی از کجا آمد؟',a:['آمریکا','ایتالیا','چین','ایران'],c:1},
    {q:'🍕 فلفل قرمز چه طعمی دارد؟',a:['شیرین','ترش','تند','تلخ'],c:2},
    {q:'🍕 ادویه زردچوبه رنگش؟',a:['قرمز','زرد','سبز','نارنجی'],c:1},
    {q:'🍕 پنیر موتزارلا اهل کجاست؟',a:['فرانسه','ایتالیا','سوئیس','هلند'],c:1},
    {q:'🍕 همبرگر اهل کجاست؟',a:['آمریکا','آلمان','انگلیس','فرانسه'],c:1},
    {q:'🍕 سالاد سزار اهل کجاست؟',a:['ایتالیا','فرانسه','مکزیک','آمریکا'],c:2},
    {q:'🍕 قارچ خوراکی چه نوع موجودی است؟',a:['گیاه','حیوان','قارچ','باکتری'],c:2},
    {q:'🍕 عسل توسط چه حیوانی ساخته می‌شود؟',a:['مورچه','زنبور','پروانه','کرم'],c:1},
    {q:'🍕 ماده اصلی نان؟',a:['برنج','گندم','جو','ذرت'],c:1},
    {q:'🍕 چای سبز از کجاست؟',a:['هند','ایران','چین','ژاپن'],c:2},
    {q:'🍕 ماده اصلی شکلات؟',a:['وانیل','کاکائو','شکر','شیر'],c:1},
  ],
  sports: [
    {q:'⚽ جام جهانی 2022 کجا بود؟',a:['روسیه','قطر','عربستان','امارات'],c:1},
    {q:'⚽ چند بازیکن در تیم فوتبال؟',a:['9','10','11','12'],c:2},
    {q:'⚽ المپیک 2024 کجا بود؟',a:['توکیو','لندن','پاریس','لس‌آنجلس'],c:2},
    {q:'⚽ بیشترین گل ملی؟',a:['رونالدو','مسی','پله','مارادونا'],c:0},
    {q:'⚽ ویمبلدون کجاست؟',a:['آمریکا','فرانسه','انگلیس','استرالیا'],c:2},
    {q:'⚽ بازیکنان والیبال؟',a:['5','6','7','8'],c:1},
    {q:'⚽ ورزش ملی ایران؟',a:['فوتبال','کشتی','والیبال','بسکتبال'],c:1},
    {q:'⚽ المپیک 2028 کجاست؟',a:['پاریس','لس‌آنجلس','بریزبن','رم'],c:1},
    {q:'⚽ بولینگ چند پین؟',a:['8','10','12','15'],c:1},
    {q:'⚽ NBA مخفف چیست؟',a:['National Basketball Assoc.','New Basketball Arena','National Ball Assoc.','None'],c:0},
    {q:'⚽ جام جهانی 2026 کجاست؟',a:['آمریکا/کانادا/مکزیک','آرژانتین','اسپانیا','عربستان'],c:0},
    {q:'⚽ فوتبال: آفساید یعنی چه؟',a:['خارج از زمین','جلوتر از مدافع','عقب‌تر از دروازه','کنار زمین'],c:1},
    {q:'⚽ المپیک زمستانی ورزش یخی؟',a:['اسکی','شنا','دو','وزنه‌برداری'],c:0},
    {q:'⚽ تنیس: چند ست برای برد؟',a:['2','3','4','5'],c:1},
    {q:'⚽ رکورد بیشترین گل جام جهانی؟',a:['رونالدو','کلوزه','پله','مسی'],c:1},
    {q:'⚽ کشتی آزاد چند وزن المپیکی؟',a:['4','6','8','10'],c:2},
    {q:'⚽ بسکتبال: ارتفاع حلقه؟',a:['2.5m','3m','3.05m','3.5m'],c:2},
    {q:'⚽ والیبال: امتیاز هر ست؟',a:['20','25','30','15'],c:1},
    {q:'⚽ شنا: کرال سینه یعنی چه؟',a:['روی شکم','روی کمر','پهلو','زیر آب'],c:0},
    {q:'⚽ دوچرخه‌سواری تور دو فرانس کجاست؟',a:['ایتالیا','اسپانیا','فرانسه','آلمان'],c:2},
  ],
  movies: [
    {q:'🎬 کارگردان تایتانیک؟',a:['اسپیلبرگ','جیمز کامرون','نولان','اسکورسیزی'],c:1},
    {q:'🎬 مدرسه هری پاتر؟',a:['دورمشتری','هاگوارتز','نارنیا','آزکابان'],c:1},
    {q:'🎬 اولین فیلم مارول؟',a:['ثور','آیرن من','کاپیتان آمریکا','هالک'],c:1},
    {q:'🎬 Inception کی ساخته؟',a:['اسپیلبرگ','نولان','کامرون','اسکورسیزی'],c:1},
    {q:'🎬 جوکر Dark Knight؟',a:['جک نیکلسون','هیث لجر','واکین فینیکس','جرد لتو'],c:1},
    {q:'🎬 Frozen از کدام استودیو؟',a:['پیکسار','دیزنی','دیم‌ورکز','ایلومینیشن'],c:1},
    {q:'🎬 فیلم ایرانی اسکار گرفته؟',a:['جدایی','فروشنده','دایره','بچه‌های آسمان'],c:1},
    {q:'🎬 کارگردان فروشنده؟',a:['کیارستمی','فرهادی','مجیدی','مخملباف'],c:1},
    {q:'🎬 Avatar چه سالی؟',a:['2007','2009','2011','2013'],c:1},
    {q:'🎬 Breaking Bad درباره چیست؟',a:['وکیل','معلم شیمی','دکتر','پلیس'],c:1},
    {q:'🎬 Game of Thrones چند فصل؟',a:['6','7','8','9'],c:2},
    {q:'🎬 سریال Friends کجا بود؟',a:['انگلیس','آمریکا','کانادا','استرالیا'],c:1},
    {q:'🎬 ماتریکس کی ساخته؟',a:['اسپیلبرگ','واچوفسکی‌ها','نولان','کامرون'],c:1},
    {q:'🎬 شیرشاه از کدام استودیو؟',a:['پیکسار','دیزنی','دیم‌ورکز','ایلومینیشن'],c:1},
    {q:'🎬 جایزه اسکار مخفف؟',a:['آکادمی','Organization Award','Oscar','None'],c:0},
    {q:'🎬 فیلم "جنگ ستارگان" کی ساخته؟',a:['اسپیلبرگ','لوکاس','کامرون','نولان'],c:1},
    {q:'🎬 پاندای کونگ‌فوکار از کجا؟',a:['ژاپن','چین','کره','تایلند'],c:1},
    {q:'🎬 سریال پیکی بلایندرز درباره؟',a:['پلیس','گانگستر','وکیل','دکتر'],c:1},
    {q:'🎬 فیلم "جوکر" 2019 کی بود؟',a:['هیث لجر','واکین فینیکس','جک نیکلسون','جرد لتو'],c:1},
    {q:'🎬 اسپایدرمن: بازیگر اصلی؟',a:['توبی مگوایر','اندرو گارفیلد','تام هالند','هر سه'],c:3},
  ],
  music: [
    {q:'🎵 ملکه پاپ؟',a:['بیانسه','مدونا','لیدی گاگا','ریانا'],c:1},
    {q:'🎵 بیتلز اهل کجا؟',a:['آمریکا','ایرلند','انگلیس','اسکاتلند'],c:2},
    {q:'🎵 پرفروشترین آلبوم؟',a:['Abbey Road','Thriller','Back in Black','The Wall'],c:1},
    {q:'🎵 گیتار چند سیم؟',a:['4','5','6','8'],c:2},
    {q:'🎵 پادشاه راک؟',a:['الویس پرسلی','چاک بری','لیتل ریچارد','بادی هالی'],c:0},
    {q:'🎵 پیانو چند کلید سفید؟',a:['36','42','52','62'],c:2},
    {q:'🎵 ساز ملی ایران؟',a:['تار','سنتور','سه‌تار','کمانچه'],c:0},
    {q:'🎵 ساز دف مال کجاست؟',a:['کردستان','آذربایجان','خوزستان','گیلان'],c:0},
    {q:'🎵 سرود ملی ایران چند بیت؟',a:['2','3','4','5'],c:2},
    {q:'🎵 راک از کجا آمد؟',a:['آمریکا','انگلیس','ایرلند','آلمان'],c:0},
    {q:'🎵 خواننده بیا بریم کوه؟',a:['محسن چاوشی','رضا صادقی','محمد علیزاده','فرزاد فرزین'],c:1},
    {q:'🎵 خواننده ایرانی پاپ؟',a:['گوگوش','ابی','درویش','شجریان'],c:0},
    {q:'🎵 اولین آهنگ میلیاردی اسپاتیفای؟',a:['Shape of You','Blinding Lights','Dance Monkey','Despacito'],c:1},
    {q:'🎵 ساز ویولن چند سیم؟',a:['3','4','5','6'],c:1},
    {q:'🎵 پیانو چند کلاویه معمولی؟',a:['76','82','88','92'],c:2},
    {q:'🎵 مایکل جکسون ملقب به؟',a:['پادشاه پاپ','ملکه پاپ','سلطان راک','استاد جاز'],c:0},
    {q:'🎵 گروه BTS اهل کجا؟',a:['ژاپن','چین','کره','تایلند'],c:2},
    {q:'🎵 ساز هارمونیکا چیست؟',a:['بادی','زهی','کوبه‌ای','الکترونیک'],c:0},
    {q:'🎵 آهنگساز سمفونی نهم؟',a:['موتسارت','بتهوون','باخ','شومان'],c:1},
    {q:'🎵 رپ از کجا آمد؟',a:['آمریکا','انگلیس','آلمان','فرانسه'],c:0},
  ],
  literature: [
    {q:'📖 شاهنامه را کی نوشت؟',a:['مولوی','فردوسی','حافظ','سعدی'],c:1},
    {q:'📖 غزلیات مال کیست؟',a:['فردوسی','مولوی','حافظ','سعدی'],c:2},
    {q:'📖 مثنوی معنوی؟',a:['حافظ','مولوی','سعدی','خیام'],c:1},
    {q:'📖 گلستان؟',a:['حافظ','مولوی','سعدی','فردوسی'],c:2},
    {q:'📖 رباعیات مال کیست؟',a:['حافظ','مولوی','سعدی','خیام'],c:3},
    {q:'📖 دیوان شمس؟',a:['حافظ','مولوی','سعدی','خیام'],c:1},
    {q:'📖 هملت کی نوشت؟',a:['دیکنز','شکسپیر','بایرون','شلی'],c:1},
    {q:'📖 ۱۹۸۴ کی نوشت؟',a:['هکسلی','ارول','کافکا','کامو'],c:1},
    {q:'📖 بوف کور؟',a:['هدایت','آلاحمد','چوبک','دشتی'],c:0},
    {q:'📖 سووشون؟',a:['هدایت','آلاحمد','دانشور','گلشیری'],c:2},
    {q:'📖 شازده کوچولو؟',a:['ویکتور هوگو','اگزوپری','کامو','سارتر'],c:1},
    {q:'📖 کلیک و دایه‌دار؟',a:['کافکا','داستایفسکی','تولستوی','هاینریش'],c:3},
    {q:'📖 حافظ اهل کجاست؟',a:['اصفهان','شیراز','تبریز','تهران'],c:1},
    {q:'📖 مولانا اهل کجاست؟',a:['تهران','بلخ','شیراز','اصفهان'],c:1},
    {q:'📖 سعدی اهل کجاست؟',a:['تهران','اصفهان','شیراز','تبریز'],c:2},
    {q:'📖 خیام اهل کجاست؟',a:['تهران','اصفهان','نیشابور','شیراز'],c:2},
    {q:'📖 شکسپیر اهل کجاست؟',a:['آمریکا','فرانسه','انگلیس','آلمان'],c:2},
    {q:'📖 تولستوی اهل کجاست؟',a:['فرانسه','آلمان','روسیه','ایتالیا'],c:2},
    {q:'📖 کافکا اهل کجاست؟',a:['آلمان','اتریش','لهستان','چک'],c:3},
    {q:'📖 ویکتور هوگو اهل کجاست؟',a:['ایتالیا','اسپانیا','فرانسه','آلمان'],c:2},
  ],
  technology: [
    {q:'💻 بنیانگذار اپل؟',a:['بیل گیتس','استیو جابز','ایلان ماسک','جف بزوس'],c:1},
    {q:'💻 بنیانگذار مایکروسافت؟',a:['استیو جابز','بیل گیتس','ایلان ماسک','مارک زاکربرگ'],c:1},
    {q:'💻 بنیانگذار فیسبوک؟',a:['بیل گیتس','استیو جابز','ایلان ماسک','مارک زاکربرگ'],c:3},
    {q:'💻 بنیانگذار تسلا؟',a:['بیل گیتس','استیو جابز','ایلان ماسک','جف بزوس'],c:2},
    {q:'💻 اولین آیفون؟',a:['2005','2006','2007','2008'],c:2},
    {q:'💻 مالک توییتر (X)؟',a:['جک دورسی','ایلان ماسک','مارک زاکربرگ','جف بزوس'],c:1},
    {q:'💻 اندروید از کیست؟',a:['اپل','مایکروسافت','گوگل','سامسونگ'],c:2},
    {q:'💻 ChatGPT از کیست؟',a:['گوگل','OpenAI','مایکروسافت','متا'],c:1},
    {q:'💻 اولین کامپیوتر؟',a:['UNIVAC','ENIAC','IBM','Apple'],c:1},
    {q:'💻 مالک اینستاگرام؟',a:['توییتر','گوگل','متا','اپل'],c:2},
    {q:'💻 HTML مخفف؟',a:['HyperText Markup Language','High Tech Modern','Home Tool Markup','None'],c:0},
    {q:'💻 پایتون از کی؟',a:['لینوس توروالدز','گویدو','جیمز گاسلینگ','بندن آیک'],c:1},
    {q:'💻 لینوکس از کی؟',a:['بیل گیتس','لینوس توروالدز','استیو جابز','مارک زاکربرگ'],c:1},
    {q:'💻 اولین وب‌سایت؟',a:['1989','1991','1993','1995'],c:1},
    {q:'💻 بیت‌کوین از کی؟',a:['ایلان ماسک','ساتوشی ناکاموتو','ویتالیک بوترین','مارک زاکربرگ'],c:1},
    {q:'💻 زبان جاوا از کیست؟',a:['گویدو','جیمز گاسلینگ','بندن آیک','لینوس توروالدز'],c:1},
    {q:'💻 بزرگترین شرکت فناوری؟',a:['مایکروسافت','اپل','گوگل','آمازون'],c:1},
    {q:'💻 اولین گوشی هوشمند؟',a:['آیفون','بلک‌بری','نوکیا','سامسونگ'],c:1},
    {q:'💻 مالک واتساپ؟',a:['گوگل','متا','توییتر','مایکروسافت'],c:1},
    {q:'💻 مالک یوتیوب؟',a:['متا','گوگل','آمازون','اپل'],c:1},
  ],
};

const CAT = {
  history:'🏛️ تاریخ',geography:'🌍 جغرافیا',science:'🔬 علوم',
  food:'🍕 غذا',sports:'⚽ ورزش',movies:'🎬 فیلم',
  music:'🎵 موسیقی',literature:'📖 ادبیات',technology:'💻 تکنولوژی'
};

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildPool(cat) {
  const cats = cat === 'all' ? Object.keys(Q) : [cat];
  let pool = [];
  for (const c of cats) {
    for (let i = 0; i < Q[c].length; i++) {
      pool.push({ ...Q[c][i], cat: c, _idx: i });
    }
  }
  return shuffle(pool);
}

// ============================================================
// INLINE HANDLER
// ============================================================
async function handleInline(iq, env) {
  const name = iq.from.first_name || 'بازیکن';
  const mkInline = (id, title, desc, cat) => ({
    type: 'article', id, title, description: desc,
    input_message_content: {
      message_text:
        '━━━━━━━━━━━━━━━━━━━\n' +
        '🎮 <b>بازی کوئیز!</b>\n' +
        '━━━━━━━━━━━━━━━━━━━\n\n' +
        '📦 ژانر: <b>' + (cat === 'all' ? 'همه' : CAT[cat]) + '</b>\n' +
        '📊 10 سوال | ⏰ 15 ثانیه\n\n' +
        '👤 سازنده: <b>' + name + '</b>\n\n' +
        '━━━━━━━━━━━━━━━━━━━\n\n' +
        '🎮 <b>پایه‌ام رو بزن!</b>',
      parse_mode: 'HTML'
    },
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎮 پایه‌ام! (1 نفر)', callback_data: 'j_' + cat + '_10_15', style: 'success' }],
        [{ text: '🚀 شروع بازی!', callback_data: 'go', style: 'primary' }],
        [{ text: '❌ لغو', callback_data: 'cancel', style: 'danger' }]
      ]
    }
  });

  const results = [
    mkInline('all', '🎯 همه ژانرها', 'کوئیز با سوالات از همه ژانرها', 'all'),
    mkInline('history', '🏛️ تاریخ', 'کوئیز تاریخی', 'history'),
    mkInline('science', '🔬 علوم', 'کوئیز علمی', 'science'),
    mkInline('geo', '🌍 جغرافیا', 'کوئیز جغرافیا', 'geography'),
    mkInline('food', '🍕 غذا', 'کوئیز غذا', 'food'),
    mkInline('sports', '⚽ ورزش', 'کوئیز ورزشی', 'sports'),
    mkInline('movies', '🎬 فیلم', 'کوئیز سینما', 'movies'),
    mkInline('music', '🎵 موسیقی', 'کوئیز موسیقی', 'music'),
    mkInline('lit', '📖 ادبیات', 'کوئیز ادبی', 'literature'),
    mkInline('tech', '💻 تکنولوژی', 'کوئیز تکنولوژی', 'technology'),
  ];
  await api(env, 'answerInlineQuery', { inline_query_id: iq.id, results, cache_time: 0, is_personal: true });
}

// ============================================================
// MESSAGE HANDLER
// ============================================================
async function handleMessage(msg, env) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const name = msg.from.first_name || 'بازیکن';
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  if (text === '/start' || text.startsWith('/start@')) {
    const t = isGroup
      ? '━━━━━━━━━━━━━━━━━━━\n🎮 <b>چالش اطلاعات</b>\n━━━━━━━━━━━━━━━━━━━\n\n📌 نحوه بازی:\n۱. تو گپ بنویس: <code>@Gamebotsbssksbot</code>\n۲. ژانر رو انتخاب کن\n۳. بقیه پایه‌ام بزنن\n۴. شروع!\n\n🎯 سوالات از 10 ژانر\n👥 چند نفره\n🏆 لیدربورد\n🔴 گزارش سوال\n\n━━━━━━━━━━━━━━━━━━━\n\n/quiz — ساخت بازی\n/score — امتیازات\n/help — راهنما'
      : '━━━━━━━━━━━━━━━━━━━\n🎮 <b>چالش اطلاعات</b>\n━━━━━━━━━━━━━━━━━━━\n\nمن رو به گروه اد کن!\n\n📌 نحوه:\n۱. اد کن به گروه\n۲. بنویس: <code>@Gamebotsbssksbot</code>\n۳. ژانر انتخاب کن\n۴. پایه‌ام بزنن\n۵. شروع!\n\n━━━━━━━━━━━━━━━━━━━';
    await api(env, 'sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML' });
    return;
  }

  if (text === '/quiz' || text.startsWith('/quiz@')) {
    if (!isGroup) { await api(env, 'sendMessage', { chat_id: chatId, text: '⚠️ فقط تو گروه!', parse_mode: 'HTML' }); return; }
    const g = G(chatId);
    if (g.state === 'playing') { await api(env, 'sendMessage', { chat_id: chatId, text: '⚠️ بازی در حال اجراست! اول /stop بزن.', parse_mode: 'HTML' }); return; }
    // Reset game
    const ng = newGame(chatId);
    ng.state = 'setup';
    ng.host = msg.from.id;
    ng.hostName = name;
    games.set(chatId, ng);

    const m = await api(env, 'sendMessage', {
      chat_id: chatId, parse_mode: 'HTML',
      text: '━━━━━━━━━━━━━━━━━━━\n⚙️ <b>تنظیمات بازی</b>\n━━━━━━━━━━━━━━━━━━━\n\n👤 سازنده: <b>' + name + '</b>\n\n📦 ژانر:',
      reply_markup: { inline_keyboard: [
        [{ text: '🏛️ تاریخ', callback_data: 'sc_history' }, { text: '🌍 جغرافیا', callback_data: 'sc_geography' }],
        [{ text: '🔬 علوم', callback_data: 'sc_science' }, { text: '🍕 غذا', callback_data: 'sc_food' }],
        [{ text: '⚽ ورزش', callback_data: 'sc_sports' }, { text: '🎬 فیلم', callback_data: 'sc_movies' }],
        [{ text: '🎵 موسیقی', callback_data: 'sc_music' }, { text: '📖 ادبیات', callback_data: 'sc_literature' }],
        [{ text: '💻 تکنولوژی', callback_data: 'sc_technology' }],
        [{ text: '🎯 همه ژانرها', callback_data: 'sc_all', style: 'primary' }]
      ]}
    });
    ng.msgId = m?.message_id;
    return;
  }

  if (text === '/stop' || text.startsWith('/stop@')) {
    const g = G(chatId);
    if (g.state !== 'playing' && g.state !== 'waiting') { await api(env, 'sendMessage', { chat_id: chatId, text: '⚠️ بازی فعالی نیست.', parse_mode: 'HTML' }); return; }
    if (g.timerHandle) clearTimeout(g.timerHandle);
    g.state = 'idle';
    if (g.msgId) await editMsg(env, chatId, g.msgId, '🛑 <b>بازی متوقف شد.</b>');
    return;
  }

  if (text === '/score' || text.startsWith('/score@')) {
    const g = G(chatId);
    if (!g.players.size) { await api(env, 'sendMessage', { chat_id: chatId, text: '📊 هنوز کسی بازی نکرده!', parse_mode: 'HTML' }); return; }
    await sendScore(env, chatId, g);
    return;
  }

  if (text === '/help' || text.startsWith('/help@')) {
    await api(env, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML',
      text: '🎮 <b>راهنما</b>\n\n📌 نحوه بازی:\n۱. تو گپ بنویس: <code>@Gamebotsbssksbot</code>\n۲. ژانر انتخاب کن\n۳. پایه‌ام بزنن\n۴. شروع!\n\n🎯 امتیاز: سریع‌تر = بیشتر + استریک\n🔴 سوال اشتباه → گزارش\n\n/quiz — ساخت بازی\n/score — امتیاز\n/stop — توقف'
    });
    return;
  }
}

// ============================================================
// CALLBACK HANDLER
// ============================================================
async function handleCallback(cb, env) {
  const chatId = cb.message.chat.id;
  const d = cb.data;
  const uid = cb.from.id;
  const name = cb.from.first_name || 'بازیکن';
  const mid = cb.message.message_id;
  const g = G(chatId);

  // ===== INLINE JOIN =====
  if (d.startsWith('j_')) {
    const parts = d.split('_');
    const cat = parts[1];
    const rounds = parseInt(parts[2]) || 10;
    const timer = parseInt(parts[3]) || 15;

    if (g.state === 'playing') { await answerCb(env, cb.id, '⚠️ بازی در حال اجراست!', true); return; }

    const ng = newGame(chatId);
    ng.state = 'waiting';
    ng.host = uid;
    ng.hostName = name;
    ng.cat = cat;
    ng.rounds = rounds;
    ng.timer = timer;
    ng.players.set(uid, newPlayer(name));
    ng.msgId = mid;
    games.set(chatId, ng);

    const cn = cat === 'all' ? 'همه' : (CAT[cat] || cat);
    await editMsg(env, chatId, mid, lobbyText(cn, rounds, timer, ng.players), lobbyKb(ng.players));
    await answerCb(env, cb.id, '✅ ' + name + ' وارد بازی شد!');
    return;
  }

  // ===== SETUP: Category =====
  if (d.startsWith('sc_')) {
    if (g.state !== 'setup') { await answerCb(env, cb.id, '⚠️ لطفاً /quiz بزنید'); return; }
    g.cat = d.replace('sc_', '');
    const cn = g.cat === 'all' ? 'همه' : (CAT[g.cat] || g.cat);
    await editMsg(env, chatId, mid,
      '━━━━━━━━━━━━━━━━━━━\n⚙️ <b>تنظیمات</b>\n━━━━━━━━━━━━━━━━━━━\n\n📦 ژانر: <b>' + cn + '</b>\n\n📊 تعداد سوال:',
      { inline_keyboard: [
        [{ text: '5 ⚡', callback_data: 'sr_5' }, { text: '10 🎯', callback_data: 'sr_10' }],
        [{ text: '15 🔥', callback_data: 'sr_15' }, { text: '20 💎', callback_data: 'sr_20' }]
      ]}
    );
    await answerCb(env, cb.id);
    return;
  }

  // ===== SETUP: Rounds =====
  if (d.startsWith('sr_')) {
    if (g.state !== 'setup') { await answerCb(env, cb.id, '⚠️ لطفاً /quiz بزنید'); return; }
    g.rounds = parseInt(d.replace('sr_', ''));
    const cn = g.cat === 'all' ? 'همه' : (CAT[g.cat] || g.cat);
    await editMsg(env, chatId, mid,
      '━━━━━━━━━━━━━━━━━━━\n⚙️ <b>تنظیمات</b>\n━━━━━━━━━━━━━━━━━━━\n\n📦 ژانر: <b>' + cn + '</b>\n📊 سوال: <b>' + g.rounds + '</b>\n\n⏰ تایمر:',
      { inline_keyboard: [
        [{ text: '10s ⚡', callback_data: 'st_10' }, { text: '15s 🎯', callback_data: 'st_15' }],
        [{ text: '20s 🔥', callback_data: 'st_20' }, { text: '30s 💎', callback_data: 'st_30' }]
      ]}
    );
    await answerCb(env, cb.id);
    return;
  }

  // ===== SETUP: Timer → Lobby =====
  if (d.startsWith('st_')) {
    if (g.state !== 'setup') { await answerCb(env, cb.id, '⚠️ لطفاً /quiz بزنید'); return; }
    g.timer = parseInt(d.replace('st_', ''));
    g.state = 'waiting';
    g.players.set(uid, newPlayer(name));
    g.msgId = mid;

    const cn = g.cat === 'all' ? 'همه' : (CAT[g.cat] || g.cat);
    await editMsg(env, chatId, mid, lobbyText(cn, g.rounds, g.timer, g.players), lobbyKb(g.players));
    await answerCb(env, cb.id, '✅ تنظیمات ذخیره شد!');
    return;
  }

  // ===== JOIN =====
  if (d === 'join') {
    if (g.state !== 'waiting') { await answerCb(env, cb.id, '⚠️ بازی در انتظار نیست!'); return; }
    if (g.players.has(uid)) { await answerCb(env, cb.id, 'قبلاً پایه زدی!'); return; }
    g.players.set(uid, newPlayer(name));
    const cn = g.cat === 'all' ? 'همه' : (CAT[g.cat] || g.cat);
    await editMsg(env, chatId, g.msgId, lobbyText(cn, g.rounds, g.timer, g.players), lobbyKb(g.players));
    await answerCb(env, cb.id, '✅ ' + name + ' اضافه شد!');
    return;
  }

  // ===== CANCEL =====
  if (d === 'cancel') {
    if (uid !== g.host) { await answerCb(env, cb.id, 'فقط سازنده!', true); return; }
    if (g.timerHandle) clearTimeout(g.timerHandle);
    g.state = 'idle';
    await editMsg(env, chatId, mid, '❌ <b>بازی لغو شد.</b>');
    await answerCb(env, cb.id, '❌ لغو شد');
    return;
  }

  // ===== GO (Start) =====
  if (d === 'go') {
    if (uid !== g.host) { await answerCb(env, cb.id, 'فقط سازنده!', true); return; }
    if (g.players.size < 2) { await answerCb(env, cb.id, 'حداقل 2 نفر لازمه!', true); return; }
    if (g.state !== 'waiting') { await answerCb(env, cb.id, '⚠️ بازی آماده نیست! /quiz بزنید', true); return; }

    g.state = 'playing';
    g.qPool = buildPool(g.cat);
    g.qIndex = 0;
    const actualRounds = Math.min(g.rounds, g.qPool.length);
    g.rounds = actualRounds;

    await nextQuestion(env, chatId, g);
    await answerCb(env, cb.id, '🚀 شروع!');
    return;
  }

  // ===== ANSWER =====
  if (d.startsWith('a_')) {
    if (g.state !== 'playing' || !g.curQ) { await answerCb(env, cb.id, '⚠️'); return; }
    const parts = d.split('_');
    const chosen = parseInt(parts[2]);

    if (g.answered.has(uid)) { await answerCb(env, cb.id, 'قبلاً جواب دادی!', true); return; }
    if (!g.players.has(uid)) g.players.set(uid, newPlayer(name));

    const p = g.players.get(uid);
    const timeSec = Math.floor((Date.now() - g.curQ.time) / 1000);
    const ok = chosen === g.curQ.c;
    g.answered.set(uid, { ans: chosen, time: timeSec, ok });

    if (ok) {
      const tb = Math.max(1, g.timer - timeSec);
      const sb = Math.min(p.streak * 2, 10);
      const pts = tb + sb + 5;
      p.score += pts;
      p.correct++;
      p.streak++;
      p.best = Math.max(p.best, p.streak);
      await answerCb(env, cb.id, '✅ درست! +' + pts + ' (' + timeSec + 's)');
    } else {
      p.wrong++;
      p.streak = 0;
      await answerCb(env, cb.id, '❌ اشتباه!');
    }

    // Auto-advance if all answered
    if (g.answered.size >= g.players.size) {
      if (g.timerHandle) clearTimeout(g.timerHandle);
      g.qIndex++;
      if (g.qIndex >= g.rounds) {
        g.state = 'finished';
        await sendFinal(env, chatId, g);
      } else {
        await nextQuestion(env, chatId, g);
      }
    }
    return;
  }

  // ===== REPORT =====
  if (d.startsWith('report_')) {
    await answerCb(env, cb.id, '🔴 گزارش ثبت شد. ممنون!', true);
    return;
  }

  // ===== NEW GAME =====
  if (d === 'new_game') {
    const ng = newGame(chatId);
    ng.state = 'setup';
    ng.host = uid;
    ng.hostName = name;
    ng.msgId = mid;
    games.set(chatId, ng);
    await editMsg(env, chatId, mid,
      '━━━━━━━━━━━━━━━━━━━\n⚙️ <b>تنظیمات بازی جدید</b>\n━━━━━━━━━━━━━━━━━━━\n\n👤 سازنده: <b>' + name + '</b>\n\n📦 ژانر:',
      { inline_keyboard: [
        [{ text: '🏛️ تاریخ', callback_data: 'sc_history' }, { text: '🌍 جغرافیا', callback_data: 'sc_geography' }],
        [{ text: '🔬 علوم', callback_data: 'sc_science' }, { text: '🍕 غذا', callback_data: 'sc_food' }],
        [{ text: '⚽ ورزش', callback_data: 'sc_sports' }, { text: '🎬 فیلم', callback_data: 'sc_movies' }],
        [{ text: '🎵 موسیقی', callback_data: 'sc_music' }, { text: '📖 ادبیات', callback_data: 'sc_literature' }],
        [{ text: '💻 تکنولوژی', callback_data: 'sc_technology' }],
        [{ text: '🎯 همه ژانرها', callback_data: 'sc_all', style: 'primary' }]
      ]}
    );
    await answerCb(env, cb.id);
    return;
  }
}

// ============================================================
// GAME FUNCTIONS
// ============================================================
function lobbyText(cn, rounds, timer, players) {
  let list = '';
  players.forEach(p => { list += '  👤 ' + p.name + '\n'; });
  return '━━━━━━━━━━━━━━━━━━━\n' +
    '🎮 <b>بازی کوئیز!</b>\n' +
    '━━━━━━━━━━━━━━━━━━━\n\n' +
    '📦 ژانر: <b>' + cn + '</b>\n' +
    '📊 سوال: <b>' + rounds + '</b> | ⏰ تایمر: <b>' + timer + 's</b>\n\n' +
    '━━━━━━━━━━━━━━━━━━━\n' +
    '👥 <b>بازیکنان (' + players.size + ' نفر):</b>\n' + list +
    '━━━━━━━━━━━━━━━━━━━\n\n' +
    '🎮 <b>پایه‌ام رو بزن!</b>';
}

function lobbyKb(players) {
  return { inline_keyboard: [
    [{ text: '🎮 پایه‌ام! (' + players.size + ' نفر)', callback_data: 'join', style: 'success' }],
    [{ text: '🚀 شروع بازی!', callback_data: 'go', style: 'primary' }],
    [{ text: '❌ لغو', callback_data: 'cancel', style: 'danger' }]
  ]};
}

async function nextQuestion(env, chatId, g) {
  if (g.qIndex >= g.qPool.length) {
    g.state = 'finished';
    await sendFinal(env, chatId, g);
    return;
  }

  const q = g.qPool[g.qIndex];
  const qId = Math.random().toString(36).substring(2, 8);
  g.curQ = { ...q, id: qId, time: Date.now() };
  g.answered = new Map();

  const e = ['🇦', '🇧', '🇨', '🇩'];
  const cn = CAT[q.cat] || q.cat;
  const ans = g.answered.size + '/' + g.players.size;

  await editMsg(env, chatId, g.msgId,
    '━━━━━━━━━━━━━━━━━━━\n' +
    '🎯 <b>سوال ' + (g.qIndex + 1) + '/' + g.rounds + '</b>\n' +
    '📦 ' + cn + ' | ⏰ ' + g.timer + 's | 👥 ' + ans + '\n' +
    '━━━━━━━━━━━━━━━━━━━\n\n' +
    q.q + '\n\n' +
    e[0] + ' ' + q.a[0] + '\n' +
    e[1] + ' ' + q.a[1] + '\n' +
    e[2] + ' ' + q.a[2] + '\n' +
    e[3] + ' ' + q.a[3] + '\n\n' +
    '━━━━━━━━━━━━━━━━━━━',
    { inline_keyboard: [
      [{ text: e[0] + ' ' + q.a[0], callback_data: 'a_' + qId + '_0', style: 'primary' },
       { text: e[1] + ' ' + q.a[1], callback_data: 'a_' + qId + '_1', style: 'primary' }],
      [{ text: e[2] + ' ' + q.a[2], callback_data: 'a_' + qId + '_2', style: 'primary' },
       { text: e[3] + ' ' + q.a[3], callback_data: 'a_' + qId + '_3', style: 'primary' }]
    ]}
  );

  // Timer
  if (g.timerHandle) clearTimeout(g.timerHandle);
  g.timerHandle = setTimeout(async () => {
    if (g.state !== 'playing') return;
    g.qIndex++;
    if (g.qIndex >= g.rounds) {
      g.state = 'finished';
      await sendFinal(env, chatId, g);
    } else {
      await nextQuestion(env, chatId, g);
    }
  }, g.timer * 1000);
}

async function sendScore(env, chatId, g) {
  const p = [...g.players.entries()].sort((a, b) => b[1].score - a[1].score);
  const medals = ['🥇', '🥈', '🥉'];
  let t = '━━━━━━━━━━━━━━━━━━━\n📊 <b>امتیازات</b>\n━━━━━━━━━━━━━━━━━━━\n\n';
  p.forEach(([id, pl], i) => {
    t += (medals[i] || '  ' + (i + 1) + '.') + ' <b>' + pl.name + '</b> — 🏆' + pl.score + ' ✅' + pl.correct + ' ❌' + pl.wrong + ' 🔥' + pl.best + '\n';
  });
  t += '\n━━━━━━━━━━━━━━━━━━━';
  await api(env, 'sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML' });
}

async function sendFinal(env, chatId, g) {
  if (g.timerHandle) clearTimeout(g.timerHandle);
  const p = [...g.players.entries()].sort((a, b) => b[1].score - a[1].score);
  if (!p.length) { g.state = 'idle'; return; }

  const w = p[0][1];
  let t = '━━━━━━━━━━━━━━━━━━━\n🏆 <b>بازی تمام شد!</b>\n━━━━━━━━━━━━━━━━━━━\n\n';
  t += '🎉 <b>برنده: ' + w.name + '</b>\n';
  t += '🏆 ' + w.score + ' امتیاز | ✅ ' + w.correct + ' درست | ❌ ' + w.wrong + ' غلط | 🔥 ' + w.best + ' استریک\n\n';
  t += '━━━━━━━━━━━━━━━━━━━\n📊 <b>رده‌بندی:</b>\n\n';

  const medals = ['🥇', '🥈', '🥉'];
  p.forEach(([id, pl], i) => {
    t += (medals[i] || '  ' + (i + 1) + '.') + ' <b>' + pl.name + '</b>\n';
    t += '    🏆 ' + pl.score + ' | ✅ ' + pl.correct + ' | ❌ ' + pl.wrong + ' | 🔥 ' + pl.best + '\n\n';
  });

  t += '━━━━━━━━━━━━━━━━━━━\n';
  t += '🎮 بازی جدید: <code>@Gamebotsbssksbot</code>';

  g.state = 'idle';

  await editMsg(env, chatId, g.msgId, t,
    { inline_keyboard: [[{ text: '🔄 بازی جدید!', callback_data: 'new_game', style: 'primary' }]] }
  );
}
