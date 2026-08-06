// Hoosh-style Quiz Bot v3 - Cloudflare Worker
// Inline game panel + group quiz like @hooshrobot

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        if (update.inline_query) {
          await handleInline(update.inline_query, env);
        } else if (update.callback_query) {
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
  return (await resp.json()).result;
}

async function send(env, chatId, text, kb) {
  return api(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...(kb ? { reply_markup: kb } : {}) });
}

async function editMsg(env, chatId, msgId, text, kb) {
  try { await api(env, 'editMessageText', { chat_id: chatId, message_id: msgId, text, parse_mode: 'HTML', ...(kb ? { reply_markup: kb } : {}) }); } catch (e) {}
}

async function answerCb(env, id, text, alert) {
  await api(env, 'answerCallbackQuery', { callback_query_id: id, text: text || '', show_alert: !!alert });
}

// ========== STATE ==========
const games = new Map();

function getGame(chatId) {
  if (!games.has(chatId)) {
    games.set(chatId, {
      state: 'idle', host: null, hostName: '',
      players: new Map(),
      settings: { category: 'all', rounds: 10, timer: 15 },
      currentQ: null, round: 0,
      answeredBy: new Map(),
      lobbyMsgId: null, questionMsgId: null,
      timerHandle: null
    });
  }
  return games.get(chatId);
}

// ========== QUESTIONS ==========
const QUESTIONS = {
  history: [
    { q: '🏛️ چه کسی تخت جمشید را ساخت؟', a: ['کوروش بزرگ', 'داریوش بزرگ', 'خشایارشا', 'اردشیر'], c: 1 },
    { q: '🏛️ سال شروع جنگ جهانی دوم؟', a: ['1935', '1939', '1941', '1945'], c: 1 },
    { q: '🏛️ اولین تمدن بشری کجا بود؟', a: ['مصر', 'بین‌النهرین', 'هند', 'چین'], c: 1 },
    { q: '🏛️ انقلاب فرانسه چه سالی بود؟', a: ['1776', '1789', '1804', '1815'], c: 1 },
    { q: '🏛️ کریستف کلمب آمریکا را چه سالی کشف کرد؟', a: ['1488', '1492', '1500', '1510'], c: 1 },
    { q: '🏛️ آخرین شاه ایران که بود؟', a: ['رضاشاه', 'محمدرضا شاه', 'احمدشاه', 'ناصرالدین شاه'], c: 1 },
    { q: '🏛️ امپراتوری عثمانی کجا بود؟', a: ['ایران', 'ترکیه', 'عربستان', 'مصر'], c: 1 },
    { q: '🏛️ سلسله صفویه کجا بود؟', a: ['تهران', 'اصفهان', 'شیراز', 'تبریز'], c: 1 },
    { q: '🏛️ ناپلئون اهل کجا بود؟', a: ['ایتالیا', 'فرانسه', 'اسپانیا', 'آلمان'], c: 1 },
    { q: '🏛️ هیتلر اهل کجا بود؟', a: ['آلمان', 'اتریش', 'لهستان', 'مجارستان'], c: 1 },
    { q: '🏛️ جنگ جهانی اول چه سالی تمام شد؟', a: ['1916', '1917', '1918', '1919'], c: 2 },
    { q: '🏛️ دیوار برلین چه سالی خراب شد؟', a: ['1987', '1988', '1989', '1990'], c: 2 },
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
    { q: '🌍 پایتخت فرانسه؟', a: ['لندن', 'برلین', 'پاریس', 'رم'], c: 2 },
    { q: '🌍 عمیق‌ترین نقطه اقیانوس؟', a: ['ماریانا', 'تونگا', 'فیلیپین', 'ژاپن'], c: 0 },
    { q: '🌍 پایتخت آلمان؟', a: ['مونیخ', 'هامبورگ', 'برلین', 'فرانکفورت'], c: 2 },
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
    { q: '🔬 واحد نیرو چیست؟', a: ['وات', 'نیوتن', 'ژول', 'پاسکال'], c: 1 },
    { q: '🔬 فرمول شیمیایی نمک؟', a: ['NaCl', 'KCl', 'CaCl2', 'MgCl2'], c: 0 },
    { q: '🔬 بزرگترین عضو بدن؟', a: ['قلب', 'کبد', 'پوست', 'مغز'], c: 2 },
    { q: '🔬 DNA مخفف چیست؟', a: ['Deoxyribonucleic Acid', 'Dinitrogen Acid', 'Dynamic Nucleus', 'None'], c: 0 },
  ],
  food: [
    { q: '🍕 پیتزا اهل کجاست؟', a: ['آمریکا', 'ایتالیا', 'فرانسه', 'اسپانیا'], c: 1 },
    { q: '🍕 سوشی اهل کجاست؟', a: ['چین', 'کره', 'ژاپن', 'تایلند'], c: 2 },
    { q: '🍕 کباب کوبیده اهل کجاست؟', a: ['ترکیه', 'ایران', 'عربستان', 'عراق'], c: 1 },
    { q: '🍕 قهوه اول از کجا آمد؟', a: ['برزیل', 'کلمبیا', 'اتیوپی', 'ترکیه'], c: 2 },
    { q: '🍕 چای اول از کجا آمد؟', a: ['هند', 'چین', 'ژاپن', 'سری‌لانکا'], c: 1 },
    { q: '🍕 ماده اصلی هوموس؟', a: ['لوبیا', 'نخود', 'عدس', 'ماش'], c: 1 },
    { q: '🍕 ادویه زعفران از کجاست؟', a: ['هند', 'ایران', 'ترکیه', 'اسپانیا'], c: 1 },
    { q: '🍕 غذای ملی ایتالیا؟', a: ['پیتزا', 'پاستا', 'ریزوتو', 'لازانیا'], c: 1 },
    { q: '🍕 نوشابه معروف آمریکایی؟', a: ['پپسی', 'کوکاکولا', 'فانتا', 'اسپرایت'], c: 1 },
    { q: '🍕 میوه ملی ایران؟', a: ['سیب', 'انار', 'انگور', 'خرما'], c: 1 },
    { q: '🍕 پنیر پیتزا از کجا آمد؟', a: ['ایتالیا', 'فرانسه', 'آمریکا', 'یونان'], c: 0 },
    { q: '🍕 بستنی از کجا آمد؟', a: ['آمریکا', 'ایتالیا', 'چین', 'ایران'], c: 1 },
  ],
  sports: [
    { q: '⚽ جام جهانی 2022 کجا بود؟', a: ['روسیه', 'قطر', 'عربستان', 'امارات'], c: 1 },
    { q: '⚽ چند بازیکن در یک تیم فوتبال؟', a: ['9', '10', '11', '12'], c: 2 },
    { q: '⚽ المپیک 2024 کجا بود؟', a: ['توکیو', 'لندن', 'پاریس', 'لس‌آنجلس'], c: 2 },
    { q: '⚽ رکورد بیشترین گل ملی؟', a: ['رونالدو', 'مسی', 'پله', 'مارادونا'], c: 0 },
    { q: '⚽ ویمبلدون کجاست؟', a: ['آمریکا', 'فرانسه', 'انگلیس', 'استرالیا'], c: 2 },
    { q: '⚽ والیبال: چند بازیکن در هر تیم؟', a: ['5', '6', '7', '8'], c: 1 },
    { q: '⚽ ورزش ملی ایران؟', a: ['فوتبال', 'کشتی', 'والیبال', 'بسکتبال'], c: 1 },
    { q: '⚽ المپیک 2028 کجاست؟', a: ['پاریس', 'لس‌آنجلس', 'بریزبن', 'رم'], c: 1 },
    { q: '⚽ بولینگ: چند پین دارد؟', a: ['8', '10', '12', '15'], c: 1 },
    { q: '⚽ ورزشکار معروف ایرانی در کشتی؟', a: ['رسول خادم', 'حسن یزدانی', 'قادریان', 'امیررضا'], c: 1 },
    { q: '⚽ NBA مخفف چیست؟', a: ['National Basketball Assoc.', 'New Basketball Arena', 'National Ball Assoc.', 'None'], c: 0 },
    { q: '⚽ جام جهانی 2026 کجاست؟', a: ['آمریکا و کانادا و مکزیک', 'آرژانتین', 'اسپانیا', 'عربستان'], c: 0 },
  ],
  movies: [
    { q: '🎬 کارگردان تایتانیک؟', a: ['اسپیلبرگ', 'جیمز کامرون', 'نولان', 'اسکورسیزی'], c: 1 },
    { q: '🎬 هری پاتر: مدرسه جادوگری؟', a: ['دورمشتری', 'هاگوارتز', 'نارنیا', 'آزکابان'], c: 1 },
    { q: '🎬 اولین فیلم مارول؟', a: ['ثور', 'آیرن من', 'کاپیتان آمریکا', 'هالک'], c: 1 },
    { q: '🎬 فیلم "Inception" کی ساخته؟', a: ['اسپیلبرگ', 'نولان', 'کامرون', 'اسکورسیزی'], c: 1 },
    { q: '🎬 بازیگر جوکر در Dark Knight؟', a: ['جک نیکلسون', 'هیث لجر', 'واکین فینیکس', 'جرد لتو'], c: 1 },
    { q: '🎬 Frozen از کدام استودیو؟', a: ['پیکسار', 'دیزنی', 'دیم‌ورکز', 'ایلومینیشن'], c: 1 },
    { q: '🎬 فیلم ایرانی اسکار گرفته؟', a: ['جدایی', 'فروشنده', 'دایره', 'بچه‌های آسمان'], c: 1 },
    { q: '🎬 کارگردان "فروشنده"؟', a: ['کیارستمی', 'فرهادی', 'مجیدی', 'مخملباف'], c: 1 },
    { q: '🎬 Avatar کی ساخته شد؟', a: ['2007', '2009', '2011', '2013'], c: 1 },
    { q: '🎬 Breaking Bad درباره چیست؟', a: ['وکیل', 'معلم شیمی', 'دکتر', 'پلیس'], c: 1 },
    { q: '🎬 جایزه اسکار مخفف چیست؟', a: ['آکادمی', 'Organization Award', 'Oscar', 'None'], c: 0 },
    { q: '🎬 سریال "Game of Thrones" چند فصل دارد؟', a: ['6', '7', '8', '9'], c: 2 },
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
    { q: '🎵 ساز "دف" مال کجاست؟', a: ['کردستان', 'آذربایجان', 'خوزستان', 'گیلان'], c: 0 },
    { q: '🎵 سرود ملی ایران چند بیت دارد؟', a: ['2', '3', '4', '5'], c: 2 },
    { q: '🎵 موسیقی راک از کجا آمد؟', a: ['آمریکا', 'انگلیس', 'ایرلند', 'آلمان'], c: 0 },
    { q: '🎵 خواننده "بیا بریم کوه"؟', a: ['محسن چاوشی', 'رضا صادقی', 'محمد علیزاده', 'فرزاد فرزین'], c: 1 },
  ],
  literature: [
    { q: '📖 شاهنامه را کی نوشت؟', a: ['مولوی', 'فردوسی', 'حافظ', 'سعدی'], c: 1 },
    { q: '📖 "غزلیات" مال کیست؟', a: ['فردوسی', 'مولوی', 'حافظ', 'سعدی'], c: 2 },
    { q: '📖 "مثنوی معنوی" کی نوشت؟', a: ['حافظ', 'مولوی', 'سعدی', 'خیام'], c: 1 },
    { q: '📖 "گلستان" کی نوشت؟', a: ['حافظ', 'مولوی', 'سعدی', 'فردوسی'], c: 2 },
    { q: '📖 "رباعیات" مال کیست؟', a: ['حافظ', 'مولوی', 'سعدی', 'خیام'], c: 3 },
    { q: '📖 "دیوان شمس" کی نوشت؟', a: ['حافظ', 'مولوی', 'سعدی', 'خیام'], c: 1 },
    { q: '📖 "هملت" کی نوشت؟', a: ['دیکنز', 'شکسپیر', 'بایرون', 'شلی'], c: 1 },
    { q: '📖 "۱۹۸۴" کی نوشت؟', a: ['هکسلی', 'ارول', 'کافکا', 'کامو'], c: 1 },
    { q: '📖 "بوف کور" کی نوشت؟', a: ['هدایت', 'آلاحمد', 'چوبک', 'دشتی'], c: 0 },
    { q: '📖 "سووشون" کی نوشت؟', a: ['هدایت', 'آلاحمد', 'دانشور', 'گلشیری'], c: 2 },
    { q: '📖 "شازده کوچولو" کی نوشت؟', a: ['ویکتور هوگو', 'اگزوپری', 'کامو', 'سارتر'], c: 1 },
    { q: '📖 "کلیک و دایه‌دار" کی نوشت؟', a: ['کافکا', 'داستایفسکی', 'تولستوی', 'هاینریش'], c: 3 },
  ],
  technology: [
    { q: '💻 بنیانگذار اپل؟', a: ['بیل گیتس', 'استیو جابز', 'ایلان ماسک', 'جف بزوس'], c: 1 },
    { q: '💻 بنیانگذار مایکروسافت؟', a: ['استیو جابز', 'بیل گیتس', 'ایلان ماسک', 'مارک زاکربرگ'], c: 1 },
    { q: '💻 بنیانگذار فیسبوک؟', a: ['بیل گیتس', 'استیو جابز', 'ایلان ماسک', 'مارک زاکربرگ'], c: 3 },
    { q: '💻 بنیانگذار تسلا؟', a: ['بیل گیتس', 'استیو جابز', 'ایلان ماسک', 'جف بزوس'], c: 2 },
    { q: '💻 اولین آیفون چه سالی؟', a: ['2005', '2006', '2007', '2008'], c: 2 },
    { q: '💻 مالک توییتر (X) کیست؟', a: ['جک دورسی', 'ایلان ماسک', 'مارک زاکربرگ', 'جف بزوس'], c: 1 },
    { q: '💻 اندروید از کیست؟', a: ['اپل', 'مایکروسافت', 'گوگل', 'سامسونگ'], c: 2 },
    { q: '💻 ChatGPT از کیست؟', a: ['گوگل', 'OpenAI', 'مایکروسافت', 'متا'], c: 1 },
    { q: '💻 اولین کامپیوتر جهان؟', a: ['UNIVAC', 'ENIAC', 'IBM', 'Apple'], c: 1 },
    { q: '💻 مالک اینستاگرام؟', a: ['توییتر', 'گوگل', 'متا', 'اپل'], c: 2 },
    { q: '💻 HTML مخفف چیست؟', a: ['HyperText Markup Language', 'High Tech Modern Language', 'Home Tool Markup', 'None'], c: 0 },
    { q: '💻 پایتون از کی ساخته شد؟', a: ['لینوس توروالدز', 'گویدو', 'جیمز گاسلینگ', 'بندن آیک'], c: 1 },
  ],
};

const CAT_NAMES = {
  history: '🏛️ تاریخ', geography: '🌍 جغرافیا', science: '🔬 علوم',
  food: '🍕 غذا', sports: '⚽ ورزش', movies: '🎬 فیلم',
  music: '🎵 موسیقی', literature: '📖 ادبیات', technology: '💻 تکنولوژی'
};

function randQ(cat) {
  const cats = cat === 'all' ? Object.keys(QUESTIONS) : [cat];
  const c = cats[Math.floor(Math.random() * cats.length)];
  const qs = QUESTIONS[c];
  const q = qs[Math.floor(Math.random() * qs.length)];
  return { ...q, category: c };
}

// ========== INLINE HANDLER ==========
async function handleInline(iq, env) {
  const query = iq.query.trim();
  const userId = iq.from.id;
  const name = iq.from.first_name || 'بازیکن';

  // Show game modes as inline results
  const results = [
    {
      type: 'article', id: 'quiz_all', title: '🎯 کوئیز - همه ژانرها',
      description: 'بازی کوئیز با سوالات از همه ژانرها',
      input_message_content: { message_text: '🎮 <b>بازی کوئیز شروع شد!</b>\n\n📦 ژانر: همه\n🎯 10 سوال | ⏰ 15 ثانیه\n\n👤 سازنده: <b>' + name + '</b>\n\n🎮 <b>پایه‌ام رو بزن!</b>', parse_mode: 'HTML' },
      reply_markup: { inline_keyboard: [[{ text: '🎮 پایه‌ام!', callback_data: 'j_all_10_15', style: 'success' }]] }
    },
    {
      type: 'article', id: 'quiz_history', title: '🏛️ کوئیز - تاریخ',
      description: 'بازی کوئیز با سوالات تاریخی',
      input_message_content: { message_text: '🎮 <b>بازی کوئیز شروع شد!</b>\n\n📦 ژانر: 🏛️ تاریخ\n🎯 10 سوال | ⏰ 15 ثانیه\n\n👤 سازنده: <b>' + name + '</b>\n\n🎮 <b>پایه‌ام رو بزن!</b>', parse_mode: 'HTML' },
      reply_markup: { inline_keyboard: [[{ text: '🎮 پایه‌ام!', callback_data: 'j_history_10_15', style: 'success' }]] }
    },
    {
      type: 'article', id: 'quiz_science', title: '🔬 کوئیز - علوم',
      description: 'بازی کوئیز با سوالات علمی',
      input_message_content: { message_text: '🎮 <b>بازی کوئیز شروع شد!</b>\n\n📦 ژانر: 🔬 علوم\n🎯 10 سوال | ⏰ 15 ثانیه\n\n👤 سازنده: <b>' + name + '</b>\n\n🎮 <b>پایه‌ام رو بزن!</b>', parse_mode: 'HTML' },
      reply_markup: { inline_keyboard: [[{ text: '🎮 پایه‌ام!', callback_data: 'j_science_10_15', style: 'success' }]] }
    },
    {
      type: 'article', id: 'quiz_geography', title: '🌍 کوئیز - جغرافیا',
      description: 'بازی کوئیز با سوالات جغرافیایی',
      input_message_content: { message_text: '🎮 <b>بازی کوئیز شروع شد!</b>\n\n📦 ژانر: 🌍 جغرافیا\n🎯 10 سوال | ⏰ 15 ثانیه\n\n👤 سازنده: <b>' + name + '</b>\n\n🎮 <b>پایه‌ام رو بزن!</b>', parse_mode: 'HTML' },
      reply_markup: { inline_keyboard: [[{ text: '🎮 پایه‌ام!', callback_data: 'j_geography_10_15', style: 'success' }]] }
    },
    {
      type: 'article', id: 'quiz_food', title: '🍕 کوئیز - غذا',
      description: 'بازی کوئیز با سوالات غذایی',
      input_message_content: { message_text: '🎮 <b>بازی کوئیز شروع شد!</b>\n\n📦 ژانر: 🍕 غذا\n🎯 10 سوال | ⏰ 15 ثانیه\n\n👤 سازنده: <b>' + name + '</b>\n\n🎮 <b>پایه‌ام رو بزن!</b>', parse_mode: 'HTML' },
      reply_markup: { inline_keyboard: [[{ text: '🎮 پایه‌ام!', callback_data: 'j_food_10_15', style: 'success' }]] }
    },
    {
      type: 'article', id: 'quiz_sports', title: '⚽ کوئیز - ورزش',
      description: 'بازی کوئیز با سوالات ورزشی',
      input_message_content: { message_text: '🎮 <b>بازی کوئیز شروع شد!</b>\n\n📦 ژانر: ⚽ ورزش\n🎯 10 سوال | ⏰ 15 ثانیه\n\n👤 سازنده: <b>' + name + '</b>\n\n🎮 <b>پایه‌ام رو بزن!</b>', parse_mode: 'HTML' },
      reply_markup: { inline_keyboard: [[{ text: '🎮 پایه‌ام!', callback_data: 'j_sports_10_15', style: 'success' }]] }
    },
    {
      type: 'article', id: 'quiz_movies', title: '🎬 کوئیز - فیلم',
      description: 'بازی کوئیز با سوالات سینمایی',
      input_message_content: { message_text: '🎮 <b>بازی کوئیز شروع شد!</b>\n\n📦 ژانر: 🎬 فیلم\n🎯 10 سوال | ⏰ 15 ثانیه\n\n👤 سازنده: <b>' + name + '</b>\n\n🎮 <b>پایه‌ام رو بزن!</b>', parse_mode: 'HTML' },
      reply_markup: { inline_keyboard: [[{ text: '🎮 پایه‌ام!', callback_data: 'j_movies_10_15', style: 'success' }]] }
    },
    {
      type: 'article', id: 'quiz_music', title: '🎵 کوئیز - موسیقی',
      description: 'بازی کوئیز با سوالات موسیقی',
      input_message_content: { message_text: '🎮 <b>بازی کوئیز شروع شد!</b>\n\n📦 ژانر: 🎵 موسیقی\n🎯 10 سوال | ⏰ 15 ثانیه\n\n👤 سازنده: <b>' + name + '</b>\n\n🎮 <b>پایه‌ام رو بزن!</b>', parse_mode: 'HTML' },
      reply_markup: { inline_keyboard: [[{ text: '🎮 پایه‌ام!', callback_data: 'j_music_10_15', style: 'success' }]] }
    },
    {
      type: 'article', id: 'quiz_lit', title: '📖 کوئیز - ادبیات',
      description: 'بازی کوئیز با سوالات ادبی',
      input_message_content: { message_text: '🎮 <b>بازی کوئیز شروع شد!</b>\n\n📦 ژانر: 📖 ادبیات\n🎯 10 سوال | ⏰ 15 ثانیه\n\n👤 سازنده: <b>' + name + '</b>\n\n🎮 <b>پایه‌ام رو بزن!</b>', parse_mode: 'HTML' },
      reply_markup: { inline_keyboard: [[{ text: '🎮 پایه‌ام!', callback_data: 'j_literature_10_15', style: 'success' }]] }
    },
    {
      type: 'article', id: 'quiz_tech', title: '💻 کوئیز - تکنولوژی',
      description: 'بازی کوئیز با سوالات تکنولوژی',
      input_message_content: { message_text: '🎮 <b>بازی کوئیز شروع شد!</b>\n\n📦 ژانر: 💻 تکنولوژی\n🎯 10 سوال | ⏰ 15 ثانیه\n\n👤 سازنده: <b>' + name + '</b>\n\n🎮 <b>پایه‌ام رو بزن!</b>', parse_mode: 'HTML' },
      reply_markup: { inline_keyboard: [[{ text: '🎮 پایه‌ام!', callback_data: 'j_technology_10_15', style: 'success' }]] }
    },
  ];

  await api(env, 'answerInlineQuery', { inline_query_id: iq.id, results, cache_time: 0, is_personal: true });
}

// ========== MESSAGE HANDLER ==========
async function handleMessage(msg, env) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const name = msg.from.first_name || 'بازیکن';
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  if (text === '/start' || text.startsWith('/start@')) {
    if (isGroup) {
      await send(env, chatId,
        '━━━━━━━━━━━━━━━━━━━\n🎮 <b>چالش اطلاعات</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
        '🎯 بازی کوئیز چند نفره!\n👥 با دوستات بازی کن\n🏆 هر کی بیشتر جواب بده برنده‌ست!\n\n' +
        '━━━━━━━━━━━━━━━━━━━\n\n' +
        '📌 <b>نحوه بازی:</b>\n' +
        '۱. تو هر گپی بنویس: <code>@Gamebotsbssksbot</code>\n' +
        '۲. ژانر بازی رو انتخاب کن\n' +
        '۳. پایه‌ام بزنن و شروع کن!\n\n' +
        '━━━━━━━━━━━━━━━━━━━\n\n' +
        'دستورات:\n' +
        '/quiz — ساخت بازی با تنظیمات\n' +
        '/score — امتیازات\n' +
        '/help — راهنما\n\n' +
        '━━━━━━━━━━━━━━━━━━━'
      );
    } else {
      await send(env, chatId,
        '━━━━━━━━━━━━━━━━━━━\n🎮 <b>چالش اطلاعات</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
        'من رو به یه گروه اد کن و با دوستات بازی کن!\n\n' +
        '📌 <b>نحوه بازی:</b>\n' +
        '۱. من رو به گروه اد کن\n' +
        '۲. تو گپ بنویس: <code>@Gamebotsbssksbot</code>\n' +
        '۳. ژانر رو انتخاب کن\n' +
        '۴. بقیه پایه‌ام بزنن\n' +
        '۵. شروع!\n\n' +
        '🎯 سوالات از 10 ژانر\n👥 چند نفره\n🏆 لیدربورد\n🔴 گزارش سوال اشتباه\n\n' +
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
    game.host = msg.from.id;
    game.hostName = name;
    game.players = new Map();

    await send(env, chatId,
      '━━━━━━━━━━━━━━━━━━━\n⚙️ <b>تنظیمات بازی</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '👤 سازنده: <b>' + name + '</b>\n\n' +
      '📦 ژانر سوالات رو انتخاب کن:',
      { inline_keyboard: [
        [{ text: '🏛️ تاریخ', callback_data: 's_cat_history' }, { text: '🌍 جغرافیا', callback_data: 's_cat_geography' }],
        [{ text: '🔬 علوم', callback_data: 's_cat_science' }, { text: '🍕 غذا', callback_data: 's_cat_food' }],
        [{ text: '⚽ ورزش', callback_data: 's_cat_sports' }, { text: '🎬 فیلم', callback_data: 's_cat_movies' }],
        [{ text: '🎵 موسیقی', callback_data: 's_cat_music' }, { text: '📖 ادبیات', callback_data: 's_cat_literature' }],
        [{ text: '💻 تکنولوژی', callback_data: 's_cat_technology' }],
        [{ text: '🎯 همه ژانرها', callback_data: 's_cat_all', style: 'primary' }]
      ]}
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
      '📌 <b>نحوه بازی:</b>\n' +
      '۱. من رو به گروه اد کن\n' +
      '۲. تو گپ بنویس: <code>@Gamebotsbssksbot</code>\n' +
      '۳. ژانر رو انتخاب کن\n' +
      '۴. بقیه پایه‌ام بزنن\n' +
      '۵. شروع!\n\n' +
      '🎯 <b>امتیازدهی:</b>\n' +
      '• جواب درست: 5 + امتیاز زمان + امتیاز استریک\n' +
      '• جواب سریع‌تر = امتیاز بیشتر\n' +
      '• جواب‌های درست پشت سر هم = استریک\n\n' +
      '🔴 <b>گزارش:</b>\n' +
      'اگه سوال اشتباه دیدی، دکمه گزارش رو بزن\n\n' +
      'دستورات:\n' +
      '/quiz — ساخت بازی با تنظیمات\n' +
      '/score — امتیازات\n' +
      '/help — راهنما'
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

  // ========== INLINE JOIN (from inline query) ==========
  if (data.startsWith('j_')) {
    const parts = data.split('_');
    const cat = parts[1];
    const rounds = parseInt(parts[2]) || 10;
    const timer = parseInt(parts[3]) || 15;

    if (game.state === 'playing') { await answerCb(env, cb.id, '⚠️ بازی در حال اجراست!', true); return; }

    game.state = 'waiting';
    game.host = userId;
    game.hostName = name;
    game.settings = { category: cat, rounds, timer };
    game.players = new Map();
    game.players.set(userId, { name, score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0 });
    game.lobbyMsgId = msgId;

    const catName = cat === 'all' ? 'همه' : (CAT_NAMES[cat] || cat);
    await editMsg(env, chatId, msgId,
      '━━━━━━━━━━━━━━━━━━━\n🎮 <b>بازی کوئیز!</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '📦 ژانر: <b>' + catName + '</b>\n' +
      '📊 تعداد سوال: <b>' + rounds + '</b>\n' +
      '⏰ تایمر: <b>' + timer + ' ثانیه</b>\n\n' +
      '━━━━━━━━━━━━━━━━━━━\n' +
      '👥 <b>بازیکنان (1 نفر):</b>\n' +
      '  👤 ' + name + '\n' +
      '━━━━━━━━━━━━━━━━━━━\n\n' +
      '🎮 <b>پایه‌ام رو بزن تا وارد بازی بشی!</b>',
      { inline_keyboard: [
        [{ text: '🎮 پایه‌ام! (1 نفر)', callback_data: 'join', style: 'success' }],
        [{ text: '🚀 شروع بازی!', callback_data: 'go', style: 'primary' }],
        [{ text: '❌ لغو', callback_data: 'cancel', style: 'danger' }]
      ]}
    );
    await answerCb(env, cb.id, '✅ بازی ساخته شد! پایه‌ام رو بزنید!');
    return;
  }

  // ========== SETUP FLOW (from /quiz) ==========
  if (data.startsWith('s_cat_')) {
    const cat = data.replace('s_cat_', '');
    game.settings.category = cat;
    const catName = cat === 'all' ? 'همه' : (CAT_NAMES[cat] || cat);
    await editMsg(env, chatId, msgId,
      '━━━━━━━━━━━━━━━━━━━\n⚙️ <b>تنظیمات بازی</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '📦 ژانر: <b>' + catName + '</b>\n\n' +
      '📊 تعداد سوال رو انتخاب کن:',
      { inline_keyboard: [
        [{ text: '5 ⚡', callback_data: 's_rnd_5' }, { text: '10 🎯', callback_data: 's_rnd_10' }],
        [{ text: '15 🔥', callback_data: 's_rnd_15' }, { text: '20 💎', callback_data: 's_rnd_20' }]
      ]}
    );
    await answerCb(env, cb.id);
    return;
  }

  if (data.startsWith('s_rnd_')) {
    game.settings.rounds = parseInt(data.replace('s_rnd_', ''));
    const catName = game.settings.category === 'all' ? 'همه' : (CAT_NAMES[game.settings.category] || game.settings.category);
    await editMsg(env, chatId, msgId,
      '━━━━━━━━━━━━━━━━━━━\n⚙️ <b>تنظیمات بازی</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '📦 ژانر: <b>' + catName + '</b>\n' +
      '📊 تعداد سوال: <b>' + game.settings.rounds + '</b>\n\n' +
      '⏰ تایمر هر سوال رو انتخاب کن:',
      { inline_keyboard: [
        [{ text: '10 ثانیه ⚡', callback_data: 's_tmr_10' }, { text: '15 ثانیه 🎯', callback_data: 's_tmr_15' }],
        [{ text: '20 ثانیه 🔥', callback_data: 's_tmr_20' }, { text: '30 ثانیه 💎', callback_data: 's_tmr_30' }]
      ]}
    );
    await answerCb(env, cb.id);
    return;
  }

  if (data.startsWith('s_tmr_')) {
    game.settings.timer = parseInt(data.replace('s_tmr_', ''));
    const catName = game.settings.category === 'all' ? 'همه' : (CAT_NAMES[game.settings.category] || game.settings.category);
    game.state = 'waiting';
    game.players = new Map();
    game.players.set(userId, { name, score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0 });
    game.lobbyMsgId = msgId;

    await editMsg(env, chatId, msgId,
      '━━━━━━━━━━━━━━━━━━━\n🎮 <b>بازی کوئیز!</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '📦 ژانر: <b>' + catName + '</b>\n' +
      '📊 تعداد سوال: <b>' + game.settings.rounds + '</b>\n' +
      '⏰ تایمر: <b>' + game.settings.timer + ' ثانیه</b>\n\n' +
      '━━━━━━━━━━━━━━━━━━━\n' +
      '👥 <b>بازیکنان (1 نفر):</b>\n' +
      '  👤 ' + name + '\n' +
      '━━━━━━━━━━━━━━━━━━━\n\n' +
      '🎮 <b>پایه‌ام رو بزن تا وارد بازی بشی!</b>',
      { inline_keyboard: [
        [{ text: '🎮 پایه‌ام! (1 نفر)', callback_data: 'join', style: 'success' }],
        [{ text: '🚀 شروع بازی!', callback_data: 'go', style: 'primary' }],
        [{ text: '❌ لغو', callback_data: 'cancel', style: 'danger' }]
      ]}
    );
    await answerCb(env, cb.id, '✅ تنظیمات ذخیره شد!');
    return;
  }

  // ========== JOIN ==========
  if (data === 'join') {
    if (game.state !== 'waiting') { await answerCb(env, cb.id, 'بازی در انتظار نیست!'); return; }
    if (game.players.has(userId)) { await answerCb(env, cb.id, 'قبلاً پایه زدی!'); return; }

    game.players.set(userId, { name, score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0 });

    let list = '';
    game.players.forEach(p => { list += '  👤 ' + p.name + '\n'; });
    const catName = game.settings.category === 'all' ? 'همه' : (CAT_NAMES[game.settings.category] || game.settings.category);

    await editMsg(env, chatId, game.lobbyMsgId,
      '━━━━━━━━━━━━━━━━━━━\n🎮 <b>بازی کوئیز!</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '📦 ژانر: <b>' + catName + '</b>\n' +
      '📊 تعداد سوال: <b>' + game.settings.rounds + '</b>\n' +
      '⏰ تایمر: <b>' + game.settings.timer + ' ثانیه</b>\n\n' +
      '━━━━━━━━━━━━━━━━━━━\n' +
      '👥 <b>بازیکنان (' + game.players.size + ' نفر):</b>\n' +
      list +
      '━━━━━━━━━━━━━━━━━━━\n\n' +
      '🎮 <b>پایه‌ام رو بزن!</b>',
      { inline_keyboard: [
        [{ text: '🎮 پایه‌ام! (' + game.players.size + ' نفر)', callback_data: 'join', style: 'success' }],
        [{ text: '🚀 شروع بازی!', callback_data: 'go', style: 'primary' }],
        [{ text: '❌ لغو', callback_data: 'cancel', style: 'danger' }]
      ]}
    );
    await answerCb(env, cb.id, '✅ ' + name + ' اضافه شد!');
    return;
  }

  // ========== CANCEL ==========
  if (data === 'cancel') {
    if (userId !== game.host) { await answerCb(env, cb.id, 'فقط سازنده!', true); return; }
    if (game.timerHandle) clearTimeout(game.timerHandle);
    game.state = 'idle';
    game.players = new Map();
    await editMsg(env, chatId, msgId, '❌ <b>بازی لغو شد.</b>');
    await answerCb(env, cb.id, '❌ لغو شد');
    return;
  }

  // ========== START ==========
  if (data === 'go') {
    if (userId !== game.host) { await answerCb(env, cb.id, 'فقط سازنده میتونه شروع کنه!', true); return; }
    if (game.players.size < 2) { await answerCb(env, cb.id, 'حداقل 2 نفر لازمه!', true); return; }

    game.state = 'playing';
    game.round = 0;

    const catName = game.settings.category === 'all' ? 'همه' : (CAT_NAMES[game.settings.category] || game.settings.category);
    await editMsg(env, chatId, game.lobbyMsgId,
      '━━━━━━━━━━━━━━━━━━━\n🚀 <b>بازی شروع شد!</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '👥 ' + game.players.size + ' بازیکن\n' +
      '📊 ' + game.settings.rounds + ' سوال\n' +
      '⏰ ' + game.settings.timer + ' ثانیه هر سوال\n\n' +
      '⏳ سوال اول...',
      null
    );

    await sendQuestion(env, chatId, game);
    await answerCb(env, cb.id, '🚀 شروع!');
    return;
  }

  // ========== ANSWER ==========
  if (data.startsWith('a_')) {
    if (game.state !== 'playing' || !game.currentQ) { await answerCb(env, cb.id, 'بازی فعال نیست!'); return; }

    const parts = data.split('_');
    const chosen = parseInt(parts[2]);

    if (game.answeredBy.has(userId)) { await answerCb(env, cb.id, 'قبلاً جواب دادی!', true); return; }

    if (!game.players.has(userId)) {
      game.players.set(userId, { name, score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0 });
    }
    const player = game.players.get(userId);
    const timeSec = Math.floor((Date.now() - game.currentQ.time) / 1000);

    game.answeredBy.set(userId, { answer: chosen, time: timeSec, correct: chosen === game.currentQ.c });

    if (chosen === game.currentQ.c) {
      const timeBonus = Math.max(1, game.settings.timer - timeSec);
      const streakBonus = Math.min(player.streak * 2, 10);
      const points = timeBonus + streakBonus + 5;
      player.score += points;
      player.correct++;
      player.streak++;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
      await answerCb(env, cb.id, '✅ درست! +' + points + ' (' + timeSec + 's)');
    } else {
      player.wrong++;
      player.streak = 0;
      await answerCb(env, cb.id, '❌ اشتباه!');
    }

    if (game.answeredBy.size >= game.players.size) {
      if (game.timerHandle) clearTimeout(game.timerHandle);
      game.round++;
      await showAnswer(env, chatId, game);
      if (game.round >= game.settings.rounds) {
        game.state = 'finished';
        setTimeout(() => sendFinal(env, chatId, game), 3000);
      } else {
        setTimeout(() => sendQuestion(env, chatId, game), 3000);
      }
    }
    return;
  }

  // ========== REPORT ==========
  if (data.startsWith('report_')) {
    await answerCb(env, cb.id, '🔴 گزارش ثبت شد. ممنون!', true);
    return;
  }
}

// ========== GAME FUNCTIONS ==========
async function sendQuestion(env, chatId, game) {
  const q = randQ(game.settings.category);
  const qId = Math.random().toString(36).substring(2, 8);
  game.currentQ = { ...q, id: qId, time: Date.now() };
  game.answeredBy = new Map();

  const e = ['🇦', '🇧', '🇨', '🇩'];
  const catName = CAT_NAMES[q.category] || q.category;

  const msg = await send(env, chatId,
    '━━━━━━━━━━━━━━━━━━━\n' +
    '🎯 <b>سوال ' + (game.round + 1) + '/' + game.settings.rounds + '</b>\n' +
    '📦 ' + catName + ' | ⏰ ' + game.settings.timer + ' ثانیه\n' +
    '━━━━━━━━━━━━━━━━━━━\n\n' +
    q.q + '\n\n' +
    e[0] + ' ' + q.a[0] + '\n' +
    e[1] + ' ' + q.a[1] + '\n' +
    e[2] + ' ' + q.a[2] + '\n' +
    e[3] + ' ' + q.a[3] + '\n\n' +
    '━━━━━━━━━━━━━━━━━━━',
    { inline_keyboard: [
      [{ text: e[0] + ' ' + q.a[0], callback_data: 'a_' + qId + '_0', style: 'primary' }, { text: e[1] + ' ' + q.a[1], callback_data: 'a_' + qId + '_1', style: 'primary' }],
      [{ text: e[2] + ' ' + q.a[2], callback_data: 'a_' + qId + '_2', style: 'primary' }, { text: e[3] + ' ' + q.a[3], callback_data: 'a_' + qId + '_3', style: 'primary' }]
    ]}
  );

  game.timerHandle = setTimeout(async () => {
    if (game.state !== 'playing') return;
    game.round++;
    await showAnswer(env, chatId, game);
    if (game.round >= game.settings.rounds) {
      game.state = 'finished';
      setTimeout(() => sendFinal(env, chatId, game), 3000);
    } else {
      setTimeout(() => sendQuestion(env, chatId, game), 3000);
    }
  }, game.settings.timer * 1000);
}

async function showAnswer(env, chatId, game) {
  if (!game.currentQ) return;
  const e = ['🇦', '🇧', '🇨', '🇩'];
  let summary = '';
  game.answeredBy.forEach((ans, uid) => {
    const p = game.players.get(uid);
    if (p) summary += (ans.correct ? '✅' : '❌') + ' ' + p.name + ': ' + e[ans.answer] + ' (' + ans.time + 's)\n';
  });
  game.players.forEach((p, uid) => {
    if (!game.answeredBy.has(uid)) summary += '⏰ ' + p.name + ': جواب نداد\n';
  });

  await send(env, chatId,
    '━━━━━━━━━━━━━━━━━━━\n' +
    '✅ <b>جواب درست: ' + e[game.currentQ.c] + ' ' + game.currentQ.a[game.currentQ.c] + '</b>\n' +
    '━━━━━━━━━━━━━━━━━━━\n\n' +
    summary + '\n' +
    '━━━━━━━━━━━━━━━━━━━',
    { inline_keyboard: [[{ text: '🔴 گزارش سوال اشتباه', callback_data: 'report_' + game.currentQ.id, style: 'danger' }]] }
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

async function sendFinal(env, chatId, game) {
  const players = [...game.players.entries()].sort((a, b) => b[1].score - a[1].score);
  if (!players.length) return;

  const w = players[0][1];
  let text = '━━━━━━━━━━━━━━━━━━━\n🏆 <b>بازی تمام شد!</b>\n━━━━━━━━━━━━━━━━━━━\n\n';
  text += '🎉 <b>برنده: ' + w.name + '</b>\n';
  text += '🏆 امتیاز: ' + w.score + ' | ✅ ' + w.correct + ' | 🔥 ' + w.bestStreak + '\n\n';
  text += '━━━━━━━━━━━━━━━━━━━\n📊 <b>رده‌بندی:</b>\n\n';

  const medals = ['🥇', '🥈', '🥉'];
  players.forEach(([id, p], i) => {
    text += (medals[i] || '  ' + (i + 1) + '.') + ' <b>' + p.name + '</b> — 🏆' + p.score + ' ✅' + p.correct + ' ❌' + p.wrong + ' 🔥' + p.bestStreak + '\n';
  });

  text += '\n━━━━━━━━━━━━━━━━━━━\n';
  text += '🎮 برای بازی جدید: <code>@Gamebotsbssksbot</code> رو تو گپ تایپ کن!';

  game.state = 'idle';
  game.players = new Map();

  await send(env, chatId, text, { inline_keyboard: [[{ text: '🔄 بازی جدید!', callback_data: 'new_game', style: 'primary' }]] });
}
