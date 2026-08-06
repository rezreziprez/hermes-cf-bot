// Hoosh-style Quiz Bot - Cloudflare Worker
// Multi-player group quiz game like @hooshrobot but better

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        if (update.callback_query) {
          await handleCallback(update.callback_query, env);
        } else if (update.message) {
          await handleMessage(update.message, env);
        }
        return new Response('OK');
      } catch (e) {
        return new Response('Error: ' + e.message, { status: 500 });
      }
    }
    return new Response('Quiz Bot Active', { status: 200 });
  },
};

// ========== HELPERS ==========
async function api(env, method, body) {
  const resp = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await resp.json();
  return data.result;
}

async function send(env, chatId, text, keyboard) {
  return api(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...(keyboard ? { reply_markup: keyboard } : {}) });
}

async function editMsg(env, chatId, msgId, text, keyboard) {
  try {
    await api(env, 'editMessageText', { chat_id: chatId, message_id: msgId, text, parse_mode: 'HTML', ...(keyboard ? { reply_markup: keyboard } : {}) });
  } catch (e) {}
}

async function deleteMsg(env, chatId, msgId) {
  try { await api(env, 'deleteMessage', { chat_id: chatId, message_id: msgId }); } catch (e) {}
}

async function answerCb(env, cbId, text, alert) {
  await api(env, 'answerCallbackQuery', { callback_query_id: cbId, text: text || '', show_alert: !!alert });
}

// ========== GAME STATE ==========
const games = new Map();

function getGame(chatId) {
  if (!games.has(chatId)) {
    games.set(chatId, {
      state: 'idle', // idle, waiting, playing, finished
      host: null, hostName: '',
      players: new Map(), // userId -> {name, score, correct, wrong, streak, bestStreak, answers}
      settings: { category: 'all', rounds: 10, timer: 15 },
      currentQ: null,
      round: 0,
      answeredBy: new Map(), // userId -> {answer, time, correct}
      questionMsgId: null,
      setupMsgId: null,
      lobbyMsgId: null,
    });
  }
  return games.get(chatId);
}

// ========== QUESTION DATABASE (PERSIAN) ==========
const QUESTIONS = {
  history: [
    { q: '🏛️ چه کسی تخت جمشید را ساخت؟', a: ['کوروش بزرگ', 'داریوش بزرگ', 'خشایارشا', 'اردشیر'], c: 1 },
    { q: '🏛️ سال شروع جنگ جهانی دوم؟', a: ['1935', '1939', '1941', '1945'], c: 1 },
    { q: '🏛️ اولین تمدن بشری کجا بود؟', a: ['مصر', 'بین‌النهرین', 'هند', 'چین'], c: 1 },
    { q: '🏛️ انقلاب فرانسه چه سالی بود؟', a: ['1776', '1789', '1804', '1815'], c: 1 },
    { q: '🏛️ کریستف کلمب آمریکا را چه سالی کشف کرد؟', a: ['1488', '1492', '1500', '1510'], c: 1 },
    { q: '🏛️ آخرین شاه ایران که بود؟', a: ['رضاشاه', 'محمدرضا شاه', 'احمدشاه', 'ناصرالدین شاه'], c: 1 },
    { q: '🏛️ امپراتوری عثمانی کجا بود؟', a: ['ایران', 'ترکیه', 'عربستان', 'مصر'], c: 1 },
    { q: '🏛️ چه کسی ایران را اسلامی کرد؟', a: ['عمربن خطاب', 'ابوبکر', 'عثمان', 'علی'], c: 0 },
    { q: '🏛️ سلسله صفویه کجا بود؟', a: ['تهران', 'اصفهان', 'شیراز', 'تبریز'], c: 1 },
    { q: '🏛️ ناپلئون اهل کجا بود؟', a: ['ایتالیا', 'فرانسه', 'اسپانیا', 'آلمان'], c: 1 },
    { q: '🏛️ هیتلر اهل کجا بود؟', a: ['آلمان', 'اتریش', 'لهستان', 'مجارستان'], c: 1 },
    { q: '🏛️ جنگ جهانی اول چه سالی تمام شد؟', a: ['1916', '1917', '1918', '1919'], c: 2 },
  ],
  geography: [
    { q: '🌍 بزرگترین کشور جهان؟', a: ['آمریکا', 'چین', 'کانادا', 'روسیه'], c: 3 },
    { q: '🌍 طولانیترین رود جهان؟', a: ['آمازون', 'نیل', 'می‌سی‌سی‌پی', 'دانوب'], c: 1 },
    { q: '🌍 پایتخت ژاپن؟', a: ['سئول', 'پکن', 'توکیو', 'بانکوک'], c: 2 },
    { q: '🌍 بلندترین قله آفریقا؟', a: ['کلیمانجارو', 'کنیا', 'اتیوپی', 'آطلس'], c: 0 },
    { q: '🌍 کوچکترین کشور جهان؟', a: ['موناکو', 'واتیکان', 'لیختن‌اشتاین', 'سان مارینو'], c: 1 },
    { q: '🌍 پایتخت استرالیا؟', a: ['سیدنی', 'ملبورن', 'کانبرا', 'بریزبن'], c: 2 },
    { q: '🌍 بزرگترین جزیره جهان؟', a: ['بورنئو', 'ماداگاسکار', 'گرینلند', 'نیوزیلند'], c: 2 },
    { q: '🌍 پایتخت ترکیه؟', a: ['استانبول', 'آنکارا', 'ازمیر', 'آنتالیا'], c: 1 },
    { q: '🌍 بزرگترین صحرای جهان؟', a: ['گبی', 'صحرای بزرگ', 'عربستان', 'آتاکاما'], c: 1 },
    { q: '🌍 عمیق‌ترین نقطه اقیانوس؟', a: ['ماریانا', 'تونگا', 'فیلیپین', 'ژاپن'], c: 0 },
    { q: '🌍 پایتخت فرانسه؟', a: ['لندن', 'برلین', 'پاریس', 'رم'], c: 2 },
    { q: '🌍 رودخانه تهران؟', a: ['کارون', 'زرینه‌رود', 'کرج', 'جاجرود'], c: 3 },
  ],
  science: [
    { q: '🔬 نماد شیمیایی آب؟', a: ['HO', 'H2O', 'OH2', 'H3O'], c: 1 },
    { q: '🔬 سرعت نور تقریباً چند km/s؟', a: ['100,000', '200,000', '300,000', '400,000'], c: 2 },
    { q: '🔬 نزدیکترین ستاره به زمین؟', a: ['سیریوس', 'آلفا قنطورس', 'خورشید', 'وگا'], c: 2 },
    { q: '🔬 گاز غالب جو زمین؟', a: ['اکسیژن', 'نیتروژن', 'کربن دی‌اکسید', 'هیدروژن'], c: 1 },
    { q: '🔬 بزرگترین سیاره منظومه شمسی؟', a: ['زحل', 'مشتری', 'اورانوس', 'نپتون'], c: 1 },
    { q: '🔬 چند استخوان در بدن انسان؟', a: ['186', '206', '226', '256'], c: 1 },
    { q: '🔬 الماس از چه ساخته شده؟', a: ['سیلیکون', 'کربن', 'آهن', 'طلا'], c: 1 },
    { q: '🔬 نیروی جاذبه را کی کشف کرد؟', a: ['اینشتین', 'نیوتن', 'گالیله', 'کپلر'], c: 1 },
    { q: '🔬 DNA مخفف چیست؟', a: ['Deoxyribonucleic Acid', 'Dinitrogen Acid', 'Dynamic Nucleus', 'None'], c: 0 },
    { q: '🔬 واحد نیرو چیست؟', a: ['وات', 'نیوتن', 'ژول', 'پاسکال'], c: 1 },
    { q: '🔬 فرمول شیمیایی نمک؟', a: ['NaCl', 'KCl', 'CaCl2', 'MgCl2'], c: 0 },
    { q: '🔬 بزرگترین عضو بدن؟', a: ['قلب', 'کبد', 'پوست', 'مغز'], c: 2 },
  ],
  food: [
    { q: '🍕 پیتزا اهل کجاست؟', a: ['آمریکا', 'ایتالیا', 'فرانسه', 'اسپانیا'], c: 1 },
    { q: '🍕 سوشی اهل کجاست؟', a: ['چین', 'کره', 'ژاپن', 'تایلند'], c: 2 },
    { q: '🍕 کباب کوبیده اهل کجاست؟', a: ['ترکیه', 'ایران', 'عربستان', 'عراق'], c: 1 },
    { q: '🍕 قهوه اول از کجا آمد؟', a: ['برزیل', 'کلمبیا', 'اتیوپی', 'ترکیه'], c: 2 },
    { q: '🍕 چای اول از کجا آمد؟', a: ['هند', 'چین', 'ژاپن', 'سری‌لانکا'], c: 1 },
    { q: '🍕 فست‌فود محبوب ایرانی‌ها؟', a: ['پیتزا', 'همبرگر', 'ساندویچ', 'کباب'], c: 0 },
    { q: '🍕 ماده اصلی هوموس؟', a: ['لوبیا', 'نخود', 'عدس', 'ماش'], c: 1 },
    { q: '🍕 پنیر پیتزا از کجا آمد؟', a: ['ایتالیا', 'فرانسه', 'آمریکا', 'یونان'], c: 0 },
    { q: '🍕 ادویه زعفران از کجاست؟', a: ['هند', 'ایران', 'ترکیه', 'اسپانیا'], c: 1 },
    { q: '🍕 میوه ملی ایران؟', a: ['سیب', 'انار', 'انگور', 'خرما'], c: 1 },
    { q: '🍕 نوشابه معروف آمریکایی؟', a: ['پپسی', 'کوکاکولا', 'فانتا', 'اسپرایت'], c: 1 },
    { q: '🍕 غذای ملی ایتالیا؟', a: ['پیتزا', 'پاستا', 'ریزوتو', 'لازانیا'], c: 1 },
  ],
  sports: [
    { q: '⚽ جام جهانی 2022 کجا بود؟', a: ['روسیه', 'قطر', 'عربستان', 'امارات'], c: 1 },
    { q: '⚽ چند بازیکن در یک تیم فوتبال؟', a: ['9', '10', '11', '12'], c: 2 },
    { q: '⚽ المپیک 2024 کجا بود؟', a: ['توکیو', 'لندن', 'پاریس', 'لس‌آنجلس'], c: 2 },
    { q: '⚽ رکورد بیشترین گل ملی؟', a: ['رونالدو', 'مسی', 'پله', 'مارادونا'], c: 0 },
    { q: '⚽ ویمبلدون کجاست؟', a: ['آمریکا', 'فرانسه', 'انگلیس', 'استرالیا'], c: 2 },
    { q: '⚽ والیبال: چند بازیکن در هر تیم؟', a: ['5', '6', '7', '8'], c: 1 },
    { q: '⚽ بسکتبال: NBA مخفف چیست؟', a: ['National Basketball Assoc.', 'New Basketball Arena', 'National Ball Assoc.', 'None'], c: 0 },
    { q: '⚽ بولینگ: چند پین دارد؟', a: ['8', '10', '12', '15'], c: 1 },
    { q: '⚽ ورزش ملی ایران؟', a: ['فوتبال', 'کشتی', 'والیبال', 'بسکتبال'], c: 1 },
    { q: '⚽ المپیک 2028 کجاست؟', a: ['پاریس', 'لس‌آنجلس', 'بریزبن', 'رم'], c: 1 },
    { q: '⚽ تیم ملی ایران در جام جهانی 2022؟', a: ['گروه A', 'گروه B', 'گروه C', 'گروه D'], c: 1 },
    { q: '⚽ ورزشکار معروف ایرانی در کشتی؟', a: ['رسول خادم', 'حسن یزدانی', 'قادریان', 'امیررضا'], c: 1 },
  ],
  movies: [
    { q: '🎬 کارگردان تایتانیک؟', a: ['اسپیلبرگ', 'جیمز کامرون', 'نولان', 'اسکورسیزی'], c: 1 },
    { q: '🎬 هری پاتر: مدرسه جادوگری؟', a: ['دورمشتری', 'هاگوارتز', 'نارنیا', 'آزکابان'], c: 1 },
    { q: '🎬 اولین فیلم مارول؟', a: ['ثور', 'آیرن من', 'کاپیتان آمریکا', 'هالک'], c: 1 },
    { q: '🎬 فیلم "Inception" کی ساخته؟', a: ['اسپیلبرگ', 'نولان', 'کامرون', 'اسکورسیزی'], c: 1 },
    { q: '🎬 بازیگر جوکر در Dark Knight؟', a: ['جک نیکلسون', 'هیث لجر', 'واکین فینیکس', 'جرد لتو'], c: 1 },
    { q: '🎬 انیمیشن "Frozen" از کدام استودیو؟', a: ['پیکسار', 'دیزنی', 'دیم‌ورکز', 'ایلومینیشن'], c: 1 },
    { q: '🎬 سریال "Friends" کجا ساخته شد؟', a: ['انگلیس', 'آمریکا', 'کانادا', 'استرالیا'], c: 1 },
    { q: '🎬 فیلم ایرانی اسکار گرفته؟', a: ['جدایی', 'فروشنده', 'دایره', 'بچه‌های آسمان'], c: 1 },
    { q: '🎬 کارگردان فیلم "فروشنده"؟', a: ['کیارستمی', 'فرهادی', 'مجیدی', 'مخملباف'], c: 1 },
    { q: '🎬 سریال "Breaking Bad" درباره چیست؟', a: ['وکیل', 'معلم شیمی', 'دکتر', 'پلیس'], c: 1 },
    { q: '🎬 جایزه اسکار مخفف چیست؟', a: ['آکادمی', 'Organization Award', 'Oscar', 'None'], c: 0 },
    { q: '🎬 فیلم "Avatar" کی ساخته شد؟', a: ['2007', '2009', '2011', '2013'], c: 1 },
  ],
  music: [
    { q: '🎵 "ملکه پاپ" کیست؟', a: ['بیانسه', 'مدونا', 'لیدی گاگا', 'ریانا'], c: 1 },
    { q: '🎵 بیتلز اهل کجا هستند؟', a: ['آمریکا', 'ایرلند', 'انگلیس', 'اسکاتلند'], c: 2 },
    { q: '🎵 پرفروشترین آلبوم تاریخ؟', a: ['Abbey Road', 'Thriller', 'Back in Black', 'The Wall'], c: 1 },
    { q: '🎵 گیتار چند سیم دارد؟', a: ['4', '5', '6', '8'], c: 2 },
    { q: '🎵 "پادشاه راک اند رول" کیست؟', a: ['الویس پرسلی', 'چاک بری', 'لیتل ریچارد', 'بادی هالی'], c: 0 },
    { q: '🎵 پیانو چند کلید سفید دارد؟', a: ['36', '42', '52', '62'], c: 2 },
    { q: '🎵 ساز ملی ایران؟', a: ['تار', 'سنتور', 'سه‌تار', 'کمانچه'], c: 0 },
    { q: '🎵 خواننده معروف ایرانی پاپ؟', a: ['گوگوش', 'ابی', 'درویش', 'شجریان'], c: 0 },
    { q: '🎵 موسیقی راک از کجا آمد؟', a: ['آمریکا', 'انگلیس', 'ایرلند', 'آلمان'], c: 0 },
    { q: '🎵 ساز "دف" مال کجاست؟', a: ['کردستان', 'آذربایج��', 'خوزستان', 'گیلان'], c: 0 },
    { q: '🎵 خواننده "بیا بریم کوه"؟', a: ['محسن چاوشی', 'رضا صادقی', 'محمد علیزاده', 'فرزاد فرزین'], c: 1 },
    { q: '🎵 سرود ملی ایران چند بیت دارد؟', a: ['2', '3', '4', '5'], c: 2 },
  ],
  literature: [
    { q: '📖 شاهناله را کی نوشت؟', a: ['مولوی', 'فردوسی', 'حافظ', 'سعدی'], c: 1 },
    { q: '📖 "غزلیات" مال کیست؟', a: ['فردوسی', 'مولوی', 'حافظ', 'سعدی'], c: 2 },
    { q: '📖 "مثنوی معنوی" کی نوشت؟', a: ['حافظ', 'مولوی', 'سعدی', 'خیام'], c: 1 },
    { q: '📖 "گلستان" کی نوشت؟', a: ['حافظ', 'مولوی', 'سعدی', 'فردوسی'], c: 2 },
    { q: '📖 "رباعیات" مال کیست؟', a: ['حافظ', 'مولوی', 'سعدی', 'خیام'], c: 3 },
    { q: '📖 "دیوان شمس" کی نوشت؟', a: ['حافظ', 'مولوی', 'سعدی', 'خیام'], c: 1 },
    { q: '📖 نویسنده "کلیک و دایه‌دار"?', a: ['کافکا', 'داستایفسکی', 'تولستوی', 'هاینریش'], c: 3 },
    { q: '📖 "هملت" کی نوشت؟', a: ['دیکنز', 'شکسپیر', 'بایرون', 'شلی'], c: 1 },
    { q: '📖 "۱۹۸۴" کی نوشت؟', a: ['هکسلی', 'ارول', 'کافکا', 'کامو'], c: 1 },
    { q: '📖 "بوف کور" کی نوشت؟', a: ['هدایت', 'آلاحمد', 'چوبک', 'دشتی'], c: 0 },
    { q: '📖 "سووشون" کی نوشت؟', a: ['هدایت', 'آلاحمد', 'دانشور', 'گلشیری'], c: 2 },
    { q: '📖 "شازده کوچولو" کی نوشت؟', a: ['ویکتور هوگو', 'اگزوپری', 'کامو', 'سارتر'], c: 1 },
  ],
  technology: [
    { q: '💻 بنیانگذار اپل؟', a: ['بیل گیتس', 'استیو جابز', 'ایلان ماسک', 'جف بزوس'], c: 1 },
    { q: '💻 بنیانگذار مایکروسافت؟', a: ['استیو جابز', 'بیل گیتس', 'ایلان ماسک', 'مارک زاکربرگ'], c: 1 },
    { q: '💻 بنیانگذار فیسبوک؟', a: ['بیل گیتس', 'استیو جابز', 'ایلان ماسک', 'مارک زاکربرگ'], c: 3 },
    { q: '💻 بنیانگذار تسلا؟', a: ['بیل گیتس', 'استیو جابز', 'ایلان ماسک', 'جف بزوس'], c: 2 },
    { q: '💻 زبان برنامه‌نویسی پایتون از کی؟', a: ['گویچی', 'لینوس توروالدز', 'گویدو', 'جیمز گاسلینگ'], c: 2 },
    { q: '💻 اولین گوشی آیفون چه سالی؟', a: ['2005', '2006', '2007', '2008'], c: 2 },
    { q: '💻 مالک توییتر (X) کیست؟', a: ['جک دورسی', 'ایلان ماسک', 'مارک زاکربرگ', 'جف بزوس'], c: 1 },
    { q: '💻 سیستم‌عامل اندروید از کیست؟', a: ['اپل', 'مایکروسافت', 'گوگل', 'سامسونگ'], c: 2 },
    { q: '💻 زبان HTML مخفف چیست؟', a: ['HyperText Markup Language', 'High Tech Modern Language', 'Home Tool Markup', 'None'], c: 0 },
    { q: '💻 ChatGPT از کیست؟', a: ['گوگل', 'OpenAI', 'مایکروسافت', 'متا'], c: 1 },
    { q: '💻 اولین کامپیوتر جهان؟', a: ['UNIVAC', 'ENIAC', 'IBM', 'Apple'], c: 1 },
    { q: '💻 مالک اینستاگرام؟', a: ['توییتر', 'گوگل', 'متا', 'اپل'], c: 2 },
  ],
};

const CAT_NAMES = {
  history: '🏛️ تاریخ', geography: '🌍 جغرافیا', science: '🔬 علوم',
  food: '🍕 غذا', sports: '⚽ ورزش', movies: '🎬 فیلم',
  music: '🎵 موسیقی', literature: '📖 ادبیات', technology: '💻 تکنولوژی'
};

function getRandomQuestion(cat) {
  const cats = cat === 'all' ? Object.keys(QUESTIONS) : [cat];
  const c = cats[Math.floor(Math.random() * cats.length)];
  const qs = QUESTIONS[c];
  const q = qs[Math.floor(Math.random() * qs.length)];
  return { ...q, category: c };
}

// ========== KEYBOARDS ==========
function catKeyboard() {
  const cats = Object.entries(CAT_NAMES);
  const rows = [];
  for (let i = 0; i < cats.length; i += 2) {
    const row = [{ text: cats[i][1], callback_data: 'cat_' + cats[i][0] }];
    if (cats[i + 1]) row.push({ text: cats[i + 1][1], callback_data: 'cat_' + cats[i + 1][0] });
    rows.push(row);
  }
  rows.push([{ text: '🎯 همه ژانرها', callback_data: 'cat_all' }]);
  return { inline_keyboard: rows };
}

function roundsKeyboard(cat) {
  return {
    inline_keyboard: [
      [{ text: '5 سوال ⚡', callback_data: 'rnd_5' }, { text: '10 سوال 🎯', callback_data: 'rnd_10' }],
      [{ text: '15 سوال 🔥', callback_data: 'rnd_15' }, { text: '20 سوال 💎', callback_data: 'rnd_20' }],
      [{ text: '🔙 تغییر ژانر', callback_data: 'setup_cat' }]
    ]
  };
}

function timerKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '10 ثانیه ⚡', callback_data: 'tmr_10' }, { text: '15 ثانیه 🎯', callback_data: 'tmr_15' }],
      [{ text: '20 ثانیه 🔥', callback_data: 'tmr_20' }, { text: '30 ثانیه 💎', callback_data: 'tmr_30' }],
      [{ text: '🔙 تغییر تعداد', callback_data: 'setup_rnd' }]
    ]
  };
}

function confirmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅ بله، درسته!', callback_data: 'confirm_start' }],
      [{ text: '🔙 تغییر تنظیمات', callback_data: 'setup_cat' }]
    ]
  };
}

function joinKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🎮 پایه‌ام! من میام', callback_data: 'join_game', style: 'success' }],
      [{ text: '❌ لغو بازی', callback_data: 'cancel_game', style: 'danger' }]
    ]
  };
}

function answerKeyboard(qId, answers) {
  return {
    inline_keyboard: [
      [{ text: '🇦 ' + answers[0], callback_data: 'a_' + qId + '_0', style: 'primary' }, { text: '🇧 ' + answers[1], callback_data: 'a_' + qId + '_1', style: 'primary' }],
      [{ text: '🇨 ' + answers[2], callback_data: 'a_' + qId + '_2', style: 'primary' }, { text: '🇩 ' + answers[3], callback_data: 'a_' + qId + '_3', style: 'primary' }]
    ]
  };
}

function reportKeyboard(qId) {
  return {
    inline_keyboard: [
      [{ text: '🔴 گزارش سوال اشتباه', callback_data: 'report_' + qId, style: 'danger' }]
    ]
  };
}

// ========== MESSAGE HANDLER ==========
async function handleMessage(msg, env) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const name = msg.from.first_name || 'بازیکن';
  const userId = msg.from.id;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  if (text === '/start' || text.startsWith('/start@')) {
    if (isGroup) {
      await send(env, chatId,
        '━━━━━━━━━━━━━━━━━━━\n🎮 <b>چالش اطلاعات</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
        '🎯 بازی کوئیز چند نفره!\n👥 با دوستات بازی کن\n🏆 هر کی بیشتر جواب بده برنده‌ست!\n\n' +
        'دستورات:\n' +
        '/quiz — ساخت بازی جدید\n' +
        '/score — امتیازات\n' +
        '/help — راهنما\n\n' +
        '━━━━━━━━━━━━━━━━━━━',
        { inline_keyboard: [[{ text: '🎮 ساخت بازی', callback_data: 'new_quiz', style: 'primary' }]] }
      );
    } else {
      await send(env, chatId,
        '━━━━━━━━━━━━━━━━━━━\n🎮 <b>چالش اطلاعات</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
        'من رو به یه گروه اد کن تا با دوستات بازی کنی!\n\n' +
        '🎯 سوالات از 10 ژانر مختلف\n👥 چند نفره\n🏆 لیدربورد و امتیازدهی\n\n' +
        '━━━━━━━━━━━━━━━━━━━'
      );
    }
    return;
  }

  if (text === '/quiz' || text.startsWith('/quiz@')) {
    if (!isGroup) { await send(env, chatId, '⚠️ فقط تو گروه میتونی بازی کنی!'); return; }
    const game = getGame(chatId);
    if (game.state === 'playing') { await send(env, chatId, '⚠️ بازی در حال اجراست!'); return; }

    game.state = 'setup';
    game.host = userId;
    game.hostName = name;
    game.players = new Map();
    game.settings = { category: 'all', rounds: 10, timer: 15 };

    await send(env, chatId,
      '━━━━━━━━━━━━━━━━━━━\n🎮 <b>ساخت بازی جدید</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '👤 سازنده: <b>' + name + '</b>\n\n' +
      '📦 ژانر سوالات رو انتخاب کن:',
      catKeyboard()
    );
    return;
  }

  if (text === '/score' || text.startsWith('/score@')) {
    const game = getGame(chatId);
    if (!game.players.size) { await send(env, chatId, '📊 هنوز کسی بازی نکرده!'); return; }
    await sendScoreboard(env, chatId, game);
    return;
  }

  if (text === '/help' || text.startsWith('/help@')) {
    await send(env, chatId,
      '🎮 <b>راهنمای چالش اطلاعات</b>\n\n' +
      '/quiz — ساخت بازی جدید\n' +
      '/score — امتیازات\n\n' +
      '🎯 هر سوال 4 جواب داره\n' +
      '⚡ جواب سریع‌تر = امتیاز بیشتر\n' +
      '🔥 جواب‌های درست پشت سر هم = استریک\n' +
      '🏆 آخر بازی برنده اعلام میشه\n' +
      '🔴 سوال اشتباه دیدی؟ گزارش کن!'
    );
    return;
  }
}

// ========== CALLBACK HANDLER ==========
async function handleCallback(cb, env) {
  const chatId = cb.message.chat.id;
  const data = cb.data;
  const userId = cb.from.id;
  const name = cb.from.first_name || 'بازیکن';
  const msgId = cb.message.message_id;
  const game = getGame(chatId);

  // ========== SETUP FLOW ==========
  if (data === 'new_quiz') {
    game.state = 'setup';
    game.host = userId;
    game.hostName = name;
    game.players = new Map();
    game.settings = { category: 'all', rounds: 10, timer: 15 };
    await editMsg(env, chatId, msgId,
      '━━━━━━━━━━━━━━━━━━━\n🎮 <b>ساخت بازی جدید</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '👤 سازنده: <b>' + name + '</b>\n\n' +
      '📦 ژانر سوالات رو انتخاب کن:',
      catKeyboard()
    );
    await answerCb(env, cb.id);
    return;
  }

  if (data === 'setup_cat') {
    await editMsg(env, chatId, msgId,
      '📦 <b>ژانر سوالات رو انتخاب کن:</b>\n\n' +
      'ژانر فعلی: <b>' + (game.settings.category === 'all' ? 'همه' : CAT_NAMES[game.settings.category]) + '</b>',
      catKeyboard()
    );
    await answerCb(env, cb.id);
    return;
  }

  if (data === 'setup_rnd') {
    await editMsg(env, chatId, msgId,
      '📊 <b>تعداد سوال رو انتخاب کن:</b>\n\n' +
      'ژانر: <b>' + (game.settings.category === 'all' ? 'همه' : CAT_NAMES[game.settings.category]) + '</b>',
      roundsKeyboard()
    );
    await answerCb(env, cb.id);
    return;
  }

  if (data.startsWith('cat_')) {
    game.settings.category = data.replace('cat_', '');
    await editMsg(env, chatId, msgId,
      '━━━━━━━━━━━━━━━━━━━\n⚙️ <b>تنظیمات بازی</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '📦 ژانر: <b>' + (game.settings.category === 'all' ? 'همه' : CAT_NAMES[game.settings.category]) + '</b>\n\n' +
      '📊 تعداد سوال رو انتخاب کن:',
      roundsKeyboard()
    );
    await answerCb(env, cb.id);
    return;
  }

  if (data.startsWith('rnd_')) {
    game.settings.rounds = parseInt(data.replace('rnd_', ''));
    await editMsg(env, chatId, msgId,
      '━━━━━━━━━━━━━━━━━━━\n⚙️ <b>تنظیمات بازی</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '📦 ژانر: <b>' + (game.settings.category === 'all' ? 'همه' : CAT_NAMES[game.settings.category]) + '</b>\n' +
      '📊 تعداد سوال: <b>' + game.settings.rounds + '</b>\n\n' +
      '⏰ تایمر هر سوال رو انتخاب کن:',
      timerKeyboard()
    );
    await answerCb(env, cb.id);
    return;
  }

  if (data.startsWith('tmr_')) {
    game.settings.timer = parseInt(data.replace('tmr_', ''));
    await editMsg(env, chatId, msgId,
      '━━━━━━━━━━━━━━━━━━━\n⚙️ <b>تنظیمات بازی</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '📦 ژانر: <b>' + (game.settings.category === 'all' ? 'همه' : CAT_NAMES[game.settings.category]) + '</b>\n' +
      '📊 تعداد سوال: <b>' + game.settings.rounds + '</b>\n' +
      '⏰ تایمر: <b>' + game.settings.timer + ' ثانیه</b>\n\n' +
      'همه چیز درسته؟',
      confirmKeyboard()
    );
    await answerCb(env, cb.id);
    return;
  }

  if (data === 'confirm_start') {
    game.state = 'waiting';
    game.players = new Map();
    game.players.set(userId, { name, score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0 });

    await editMsg(env, chatId, msgId,
      '━━━━━━━━━━━━━━━━━━━\n🎮 <b>بازی ساخته شد!</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '📦 ژانر: <b>' + (game.settings.category === 'all' ? 'همه' : CAT_NAMES[game.settings.category]) + '</b>\n' +
      '📊 تعداد سوال: <b>' + game.settings.rounds + '</b>\n' +
      '⏰ تایمر: <b>' + game.settings.timer + ' ثانیه</b>\n\n' +
      '👤 سازنده: <b>' + name + '</b>\n\n' +
      '━━━━━━━━━━━━━━━━━━━\n\n' +
      '🎮 <b>پایه‌ام رو بزن تا وارد بازی بشی!</b>',
      joinKeyboard()
    );
    game.lobbyMsgId = msgId;
    await answerCb(env, cb.id, '✅ بازی ساخته شد! پایه‌ام رو بزنید!');
    return;
  }

  // ========== JOIN / CANCEL ==========
  if (data === 'join_game') {
    if (game.state !== 'waiting') { await answerCb(env, cb.id, 'بازی در انتظار نیست!'); return; }
    if (game.players.has(userId)) { await answerCb(env, cb.id, 'قبلاً پایه زدی!'); return; }

    game.players.set(userId, { name, score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0 });

    let playerList = '';
    game.players.forEach((p, id) => { playerList += '  👤 ' + p.name + '\n'; });

    await editMsg(env, chatId, game.lobbyMsgId,
      '━━━━━━━━━━━━━━━━━━━\n🎮 <b>بازی ساخته شد!</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '📦 ژانر: <b>' + (game.settings.category === 'all' ? 'همه' : CAT_NAMES[game.settings.category]) + '</b>\n' +
      '📊 تعداد سوال: <b>' + game.settings.rounds + '</b>\n' +
      '⏰ تایمر: <b>' + game.settings.timer + ' ثانیه</b>\n\n' +
      '━━━━━━━━━━━━━━━━━━━\n' +
      '👥 <b>بازیکنان (' + game.players.size + ' نفر):</b>\n' +
      playerList +
      '━━━━━━━━━━━━━━━━━━━\n\n' +
      '🎮 <b>پایه‌ام رو بزن تا وارد بازی بشی!</b>\n\n' +
      (game.players.size >= 2 ? '🚀 سازنده میتونه بازی رو شروع کنه!' : ''),
      {
        inline_keyboard: [
          [{ text: '🎮 پایه‌ام! من میام (' + game.players.size + ' نفر)', callback_data: 'join_game', style: 'success' }],
          game.players.size >= 2 ? [{ text: '🚀 شروع بازی!', callback_data: 'start_play', style: 'primary' }] : [],
          [{ text: '❌ لغو بازی', callback_data: 'cancel_game', style: 'danger' }]
        ]
      }
    );
    await answerCb(env, cb.id, '✅ ' + name + ' به بازی اضافه شد!');
    return;
  }

  if (data === 'cancel_game') {
    if (userId !== game.host && userId !== cb.message.chat.id) { await answerCb(env, cb.id, 'فقط سازنده میتونه لغو کنه!', true); return; }
    game.state = 'idle';
    game.players = new Map();
    await editMsg(env, chatId, msgId, '❌ <b>بازی لغو شد.</b>');
    await answerCb(env, cb.id, '❌ بازی لغو شد');
    return;
  }

  // ========== START PLAY ==========
  if (data === 'start_play') {
    if (userId !== game.host) { await answerCb(env, cb.id, 'فقط سازنده میتونه شروع کنه!', true); return; }
    if (game.players.size < 2) { await answerCb(env, cb.id, 'حداقل 2 نفر لازمه!', true); return; }

    game.state = 'playing';
    game.round = 0;

    await editMsg(env, chatId, game.lobbyMsgId,
      '━━━━━━━━━━━━━━━━━━━\n🚀 <b>بازی شروع شد!</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '👥 ' + game.players.size + ' بازیکن\n' +
      '📊 ' + game.settings.rounds + ' سوال\n' +
      '⏰ ' + game.settings.timer + ' ثانیه هر سوال\n\n' +
      '⏳ سوال اول...',
      null
    );

    await sendQuestion(env, chatId, game);
    await answerCb(env, cb.id, '🚀 بازی شروع شد!');
    return;
  }

  // ========== ANSWER ==========
  if (data.startsWith('a_')) {
    if (game.state !== 'playing' || !game.currentQ) { await answerCb(env, cb.id, 'بازی فعال نیست!'); return; }

    const parts = data.split('_');
    const qId = parts[1];
    const chosen = parseInt(parts[2]);

    if (game.answeredBy.has(userId)) { await answerCb(env, cb.id, 'قبلاً جواب دادی!', true); return; }

    if (!game.players.has(userId)) {
      game.players.set(userId, { name, score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0 });
    }
    const player = game.players.get(userId);
    const timeMs = Date.now() - game.currentQ.time;
    const timeSec = Math.floor(timeMs / 1000);

    game.answeredBy.set(userId, { answer: chosen, time: timeSec, correct: chosen === game.currentQ.c });

    if (chosen === game.currentQ.c) {
      const timeBonus = Math.max(1, game.settings.timer - timeSec);
      const streakBonus = Math.min(player.streak * 2, 10);
      const points = timeBonus + streakBonus + 5;
      player.score += points;
      player.correct++;
      player.streak++;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
      await answerCb(env, cb.id, '✅ درست! +' + points + ' امتیاز (' + timeSec + ' ثانیه)');
    } else {
      player.wrong++;
      player.streak = 0;
      await answerCb(env, cb.id, '❌ اشتباه! جواب درست: ' + game.currentQ.a[game.currentQ.c]);
    }

    // Check if all players answered
    if (game.answeredBy.size >= game.players.size) {
      clearTimeout(game.timerHandle);
      game.round++;
      if (game.round >= game.settings.rounds) {
        game.state = 'finished';
        await showCorrectAnswer(env, chatId, game);
        setTimeout(async () => { await sendFinalScoreboard(env, chatId, game); }, 3000);
      } else {
        await showCorrectAnswer(env, chatId, game);
        setTimeout(async () => { await sendQuestion(env, chatId, game); }, 3000);
      }
    }
    return;
  }

  // ========== REPORT ==========
  if (data.startsWith('report_')) {
    const qId = data.replace('report_', '');
    await answerCb(env, cb.id, '🔴 سوال گزارش شد. ممنون!', true);
    await send(env, chatId, '🔴 <b>گزارش ثبت شد</b>\n\nسوال: ' + (game.currentQ?.q || 'نامشخص') + '\nگزارش‌دهنده: ' + name);
    return;
  }
}

// ========== GAME FUNCTIONS ==========
async function sendQuestion(env, chatId, game) {
  const q = getRandomQuestion(game.settings.category);
  const qId = Math.random().toString(36).substring(2, 8);
  game.currentQ = { ...q, id: qId, time: Date.now() };
  game.answeredBy = new Map();

  const emoji = ['🇦', '🇧', '🇨', '🇩'];
  const catName = CAT_NAMES[q.category] || q.category;

  const msg = await send(env, chatId,
    '━━━━━━━━━━━━━━━━━━━\n' +
    '🎯 <b>سوال ' + (game.round + 1) + '/' + game.settings.rounds + '</b>\n' +
    '📦 ' + catName + ' | ⏰ ' + game.settings.timer + ' ثانیه\n' +
    '━━━━━━━━━━━━━━━━━━━\n\n' +
    q.q + '\n\n' +
    emoji[0] + ' ' + q.a[0] + '\n' +
    emoji[1] + ' ' + q.a[1] + '\n' +
    emoji[2] + ' ' + q.a[2] + '\n' +
    emoji[3] + ' ' + q.a[3] + '\n\n' +
    '━━━━━━━━━━━━━━━━━━━',
    answerKeyboard(qId, q.a)
  );

  game.questionMsgId = msg?.message_id;

  // Timer
  game.timerHandle = setTimeout(async () => {
    if (game.state !== 'playing') return;
    game.round++;
    await showCorrectAnswer(env, chatId, game);
    if (game.round >= game.settings.rounds) {
      game.state = 'finished';
      setTimeout(async () => { await sendFinalScoreboard(env, chatId, game); }, 3000);
    } else {
      setTimeout(async () => { await sendQuestion(env, chatId, game); }, 3000);
    }
  }, game.settings.timer * 1000);
}

async function showCorrectAnswer(env, chatId, game) {
  if (!game.currentQ) return;
  const correct = game.currentQ.c;
  const emoji = ['🇦', '🇧', '🇨', '🇩'];

  let answerSummary = '';
  game.answeredBy.forEach((ans, uid) => {
    const player = game.players.get(uid);
    if (player) {
      answerSummary += (ans.correct ? '✅' : '❌') + ' ' + player.name + ': ' + emoji[ans.answer] + ' (' + ans.time + ' ثانیه)\n';
    }
  });

  // Players who didn't answer
  game.players.forEach((player, uid) => {
    if (!game.answeredBy.has(uid)) {
      answerSummary += '⏰ ' + player.name + ': جواب نداد\n';
    }
  });

  await send(env, chatId,
    '━━━━━━━━━━━━━━━━━━━\n' +
    '✅ <b>جواب درست: ' + emoji[correct] + ' ' + game.currentQ.a[correct] + '</b>\n' +
    '━━━━━━━━━━━━━━━━━━━\n\n' +
    answerSummary + '\n' +
    '━━━━━━━━━━━━━━━━━━━',
    reportKeyboard(game.currentQ.id)
  );
}

async function sendScoreboard(env, chatId, game) {
  const players = [...game.players.entries()].sort((a, b) => b[1].score - a[1].score);
  const medals = ['🥇', '🥈', '🥉'];
  let text = '━━━━━━━━━━━━━━━━━━━\n📊 <b>امتیازات</b>\n━━━━━━━━━━━━━━━━━━━\n\n';
  players.forEach(([id, p], i) => {
    text += (medals[i] || '  ' + (i + 1) + '.') + ' <b>' + p.name + '</b>\n';
    text += '    🏆 ' + p.score + ' | ✅ ' + p.correct + ' | ❌ ' + p.wrong + ' | 🔥 ' + p.bestStreak + '\n\n';
  });
  text += '━━━━━━━━━━━━━━━━━━━';
  await send(env, chatId, text);
}

async function sendFinalScoreboard(env, chatId, game) {
  const players = [...game.players.entries()].sort((a, b) => b[1].score - a[1].score);
  if (!players.length) { await send(env, chatId, '📊 بازی تموم شد ولی کسی بازی نکرد!'); return; }

  const winner = players[0][1];
  let text = '━━━━━━━━━━━━━━━━━━━\n🏆 <b>بازی تمام شد!</b>\n━━━━━━━━━━━━━━━━━━━\n\n';
  text += '🎉 <b>برنده: ' + winner.name + '</b>\n';
  text += '🏆 امتیاز: ' + winner.score + '\n';
  text += '✅ جواب‌های درست: ' + winner.correct + '\n';
  text += '🔥 بهترین استریک: ' + winner.bestStreak + '\n\n';
  text += '━━━━━━━━━━━━━━━━━━━\n';
  text += '📊 <b>رده‌بندی کامل:</b>\n\n';

  const medals = ['🥇', '🥈', '🥉'];
  players.forEach(([id, p], i) => {
    text += (medals[i] || '  ' + (i + 1) + '.') + ' <b>' + p.name + '</b>\n';
    text += '    🏆 ' + p.score + ' | ✅ ' + p.correct + ' | ❌ ' + p.wrong + ' | 🔥 ' + p.bestStreak + '\n\n';
  });

  text += '━━━━━━━━━━━━━━━━━━━\n';
  text += '/quiz برای بازی جدید!';

  game.state = 'idle';
  game.players = new Map();

  await send(env, chatId, text, { inline_keyboard: [[{ text: '🔄 بازی جدید!', callback_data: 'new_quiz', style: 'primary' }]] });
}
