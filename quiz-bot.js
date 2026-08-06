// Group Quiz Bot - Cloudflare Worker
// Multi-player quiz game for Telegram groups

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
async function send(env, chatId, text, keyboard) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (keyboard) body.reply_markup = keyboard;
  const resp = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await resp.json();
  return data.result?.message_id;
}

async function editMsg(env, chatId, msgId, text, keyboard) {
  const body = { chat_id: chatId, message_id: msgId, text, parse_mode: 'HTML' };
  if (keyboard) body.reply_markup = keyboard;
  await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/editMessageText', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
}

async function deleteMsg(env, chatId, msgId) {
  await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/deleteMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: msgId })
  });
}

async function answerCb(env, cbId, text) {
  await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/answerCallbackQuery', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: cbId, text, show_alert: false })
  });
}

// ========== QUESTION DATABASE ==========
const QUESTIONS = {
  history: [
    { q: '🏛️ چه کسی تخت جمشید را ساخت؟', a: ['کوروش بزرگ', 'داریوش بزرگ', 'خشایارشا', 'اردشیر'], correct: 1 },
    { q: '🏛️ سال جنگ جهانی دوم؟', a: ['1935', '1939', '1941', '1945'], correct: 1 },
    { q: '🏛️ اولین تمدن بشری کجا بود؟', a: ['مصر', 'بین‌النهرین', 'هند', 'چین'], correct: 1 },
    { q: '🏛️ دیوار بزرگ چین را کی ساخت؟', a: ['کنفوسیوس', 'شی هوانگ', 'چنگیز', 'کوبلای'], correct: 1 },
    { q: '🏛️ انقلاب فرانسه چه سالی بود؟', a: ['1776', '1789', '1804', '1815'], correct: 1 },
    { q: '🏛️ کریستف کلمب آمریکا را چه سالی کشف کرد؟', a: ['1488', '1492', '1500', '1510'], correct: 1 },
    { q: '🏛️ آخرین شاه ایران که بود؟', a: ['رضاشاه', 'محمدرضا شاه', 'احمدشاه', 'ناصرالدین شاه'], correct: 1 },
    { q: '🏛️ امپراتوری عثمانی کجا بود؟', a: ['ایران', 'ترکیه', 'عربستان', 'مصر'], correct: 1 },
  ],
  math: [
    { q: '🔢 ریشه دوم 144 چند است؟', a: ['10', '11', '12', '13'], correct: 2 },
    { q: '🔢 15 × 15 چند است؟', a: ['200', '215', '225', '250'], correct: 2 },
    { q: '🔢 عدد پی تا 2 رقم اعشار؟', a: ['3.12', '3.14', '3.16', '3.18'], correct: 1 },
    { q: '🔢 اگر x + 5 = 12 باشد، x چند است؟', a: ['5', '6', '7', '8'], correct: 2 },
    { q: '🔢 مساحت دایره با شعاع 7؟', a: ['144', '148', '154', '158'], correct: 2 },
    { q: '🔢 2 به توان 10 چند است؟', a: ['512', '1000', '1024', '2048'], correct: 2 },
    { q: '🔢 جمع زوایای مثلث؟', a: ['90', '120', '180', '360'], correct: 2 },
    { q: '🔢 1000 تقسیم بر 8 چند است؟', a: ['112', '120', '125', '150'], correct: 2 },
  ],
  science: [
    { q: '🔬 نماد شیمیایی آب؟', a: ['HO', 'H2O', 'OH2', 'H3O'], correct: 1 },
    { q: '🔬 سرعت نور تقریباً چند km/s؟', a: ['100,000', '200,000', '300,000', '400,000'], correct: 2 },
    { q: '🔬 نزدیکترین ستاره به زمین؟', a: ['سیریوس', 'آلفا قنطورس', 'خورشید', 'وگا'], correct: 2 },
    { q: '🔬 DNA مخفف چیست؟', a: ['Deoxyribonucleic Acid', 'Dinitrogen Acid', 'Dynamic Nucleus', 'None'], correct: 0 },
    { q: '🔬 گاز غالب جو زمین؟', a: ['اکسیژن', 'نیتروژن', 'کربن دی‌اکسید', 'هیدروژن'], correct: 1 },
    { q: '🔬 بزرگترین سیاره منظومه شمسی؟', a: ['زحل', 'مشتری', 'اورانوس', 'نپتون'], correct: 1 },
    { q: '🔬 چند استخوان در بدن انسان؟', a: ['186', '206', '226', '256'], correct: 1 },
    { q: '🔬 الماس از چه element ساخته شده؟', a: ['سیلیکون', 'کربن', 'آهن', 'طلا'], correct: 1 },
  ],
  geography: [
    { q: '🌍 بزرگترین کشور جهان؟', a: ['آمریکا', 'چین', 'کانادا', 'روسیه'], correct: 3 },
    { q: '🌍 طولانیترین رود جهان؟', a: ['آمازون', 'نیل', 'می‌سی‌سی‌پی', 'دانوب'], correct: 1 },
    { q: '🌍 پایتخت ژاپن؟', a: ['سئول', 'پکن', 'توکیو', 'بانکوک'], correct: 2 },
    { q: '🌍 بلندترین قله آفریقا؟', a: ['کلیمانجارو', 'کنیا', 'اتیوپی', 'آطلس'], correct: 0 },
    { q: '🌍 کوچکترین کشور جهان؟', a: ['موناکو', 'واتیکان', 'لیختن‌اشتاین', 'سان مارینو'], correct: 1 },
    { q: '🌍 پایتخت استرالیا؟', a: ['سیدنی', 'ملبورن', 'کانبرا', 'بریزبن'], correct: 2 },
    { q: '🌍 بزرگترین جزیره جهان؟', a: ['بورنئو', 'ماداگاسکار', 'گرینلند', 'نیوزیلند'], correct: 2 },
    { q: '🌍 پایتخت ترکیه؟', a: ['استانبول', 'آنکارا', 'ازمیر', 'آنتالیا'], correct: 1 },
  ],
  food: [
    { q: '🍕 پیتزا اهل کجاست؟', a: ['آمریکا', 'ایتالیا', 'فرانسه', 'اسپانیا'], correct: 1 },
    { q: '🍕 سوشی اهل کجاست؟', a: ['چین', 'کره', 'ژاپن', 'تایلند'], correct: 2 },
    { q: '🍕 فلفل قرمز چه طعمی دارد؟', a: ['شیرین', 'ترش', 'تند', 'تلخ'], correct: 2 },
    { q: '🍕 پاستا اهل کجاست؟', a: ['فرانسه', 'ایتالیا', 'اسپانیا', 'یونان'], correct: 1 },
    { q: '🍕 همبرگر اهل کجاست؟', a: ['آمریکا', 'آلمان', 'انگلیس', 'فرانسه'], correct: 1 },
    { q: '🍕 کباب کوبیده اهل کجاست؟', a: ['ترکیه', 'ایران', 'عربستان', 'عراق'], correct: 1 },
    { q: '🍕 قهوه اول از کجا آمد؟', a: ['برزیل', 'کلمبیا', 'اتیوپی', 'ترکیه'], correct: 2 },
    { q: '🍕 چای اول از کجا آمد؟', a: ['هند', 'چین', 'ژاپن', 'سری‌لانکا'], correct: 1 },
  ],
  sports: [
    { q: '⚽ جام جهانی فوتبال 2022 کجا بود؟', a: ['روسیه', 'قطر', 'عربستان', 'امارات'], correct: 1 },
    { q: '⚽ چند بازیکن در یک تیم فوتبال؟', a: ['9', '10', '11', '12'], correct: 2 },
    { q: '⚽ المپیک 2024 کجا بود؟', a: ['توکیو', 'لندن', 'پاریس', 'لس‌آنجلس'], correct: 2 },
    { q: '⚽ رکورد بیشترین گل ملی؟', a: ['رونالدو', 'مسی', 'پله', 'مارادونا'], correct: 0 },
    { q: '⚽ تنیس: ویمبلدون کجاست؟', a: ['آمریکا', 'فرانسه', 'انگلیس', 'استرالیا'], correct: 2 },
    { q: '⚽ بسکتبال: NBA مخفف چیست؟', a: ['National Basketball Assoc.', 'New Basketball Arena', 'National Ball Assoc.', 'None'], correct: 0 },
    { q: '⚽ والیبال: چند بازیکن در هر تیم؟', a: ['5', '6', '7', '8'], correct: 1 },
    { q: '⚽ بولینگ: چند پین دارد؟', a: ['8', '10', '12', '15'], correct: 1 },
  ],
  movies: [
    { q: '🎬 کارگردان تایتانیک؟', a: ['اسپیلبرگ', 'جیمز کامرون', 'نولان', 'اسکورسیزی'], correct: 1 },
    { q: '🎬 هری پاتر: مدرسه جادوگری؟', a: ['دورمشتری', 'هاگوارتز', 'نارنیا', 'آزکابان'], correct: 1 },
    { q: '🎬 اولین فیلم مارول؟', a: ['ثور', 'آیرن من', 'کاپیتان آمریکا', 'هالک'], correct: 1 },
    { q: '🎬 فیلم "Inception" کی ساخته؟', a: ['اسپیلبرگ', 'نولان', 'کامرون', 'اسکورسیزی'], correct: 1 },
    { q: '🎬 جایزه اسکار مخفف چیست؟', a: ['آکادمی', 'Organization Award', 'Oscar', 'None'], correct: 0 },
    { q: '🎬 بازیگر جوکر در Dark Knight؟', a: ['جک نیکلسون', 'هیث لجر', 'واکین فینیکس', 'جرد لتو'], correct: 1 },
    { q: '🎬 سریال "Friends" کجا ساخته شد؟', a: ['انگلیس', 'آمریکا', 'کانادا', 'استرالیا'], correct: 1 },
    { q: '🎬 انیمیشن "Frozen" از کدام استودیو؟', a: ['پیکسار', 'دیزنی', 'دیم‌ورکز', 'ایلومینیشن'], correct: 1 },
  ],
  music: [
    { q: '🎵 "ملکه پاپ" کیست؟', a: ['بیانسه', 'مدونا', 'لیدی گاگا', 'ریانا'], correct: 1 },
    { q: '🎵 بیتلز اهل کجا هستند؟', a: ['آمریکا', 'ایرلند', 'انگلیس', 'اسکاتلند'], correct: 2 },
    { q: '🎵 پرفروشترین آلبوم تاریخ؟', a: ['Abbey Road', 'Thriller', 'Back in Black', 'The Wall'], correct: 1 },
    { q: '🎵 گیتار چند سیم دارد؟', a: ['4', '5', '6', '8'], correct: 2 },
    { q: '🎵 "پادشاه راک اند رول" کیست؟', a: ['الویس پرسلی', 'چاک بری', 'لیتل ریچارد', 'بادی هالی'], correct: 0 },
    { q: '🎵 اولین آهنگ میلیاردی اسپاتیفای؟', a: ['Shape of You', 'Blinding Lights', 'Dance Monkey', 'Despacito'], correct: 1 },
    { q: '🎵 پیانو چند کلید سفید دارد؟', a: ['36', '42', '52', '62'], correct: 2 },
    { q: '🎵 ساز ملی ایران؟', a: ['تار', 'سنتور', 'سه‌تار', 'کمانچه'], correct: 0 },
  ],
};

const CATEGORY_NAMES = {
  history: '🏛️ تاریخ', math: '🔢 ریاضی', science: '🔬 علوم',
  geography: '🌍 جغرافیا', food: '🍕 غذا', sports: '⚽ ورزش',
  movies: '🎬 فیلم', music: '🎵 موسیقی'
};

// ========== GAME STATE ==========
const games = new Map();

function getGame(chatId) {
  if (!games.has(chatId)) {
    games.set(chatId, { active: false, players: {}, currentQ: null, round: 0, totalRounds: 10, category: 'all', questionMsgId: null, answeredBy: new Set() });
  }
  return games.get(chatId);
}

function getRandomQuestion(category) {
  const cats = category === 'all' ? Object.keys(QUESTIONS) : [category];
  const cat = cats[Math.floor(Math.random() * cats.length)];
  const qs = QUESTIONS[cat];
  const q = qs[Math.floor(Math.random() * qs.length)];
  return { ...q, category: cat };
}

function getQuestionKeyboard(qId, answers) {
  const emojis = ['🇦', '🇧', '🇨', '🇩'];
  return {
    inline_keyboard: [
      [{ text: emojis[0] + ' ' + answers[0], callback_data: 'ans_' + qId + '_0' }, { text: emojis[1] + ' ' + answers[1], callback_data: 'ans_' + qId + '_1' }],
      [{ text: emojis[2] + ' ' + answers[2], callback_data: 'ans_' + qId + '_2' }, { text: emojis[3] + ' ' + answers[3], callback_data: 'ans_' + qId + '_3' }]
    ]
  };
}

function getCategoryKeyboard() {
  const cats = Object.entries(CATEGORY_NAMES);
  const rows = [];
  for (let i = 0; i < cats.length; i += 2) {
    const row = [{ text: cats[i][1], callback_data: 'cat_' + cats[i][0] }];
    if (cats[i + 1]) row.push({ text: cats[i + 1][1], callback_data: 'cat_' + cats[i + 1][0] });
    rows.push(row);
  }
  rows.push([{ text: '🎯 همه ژانرها', callback_data: 'cat_all' }]);
  return { inline_keyboard: rows };
}

function getSettingsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '5 سوال', callback_data: 'rounds_5' }, { text: '10 سوال', callback_data: 'rounds_10' }, { text: '15 سوال', callback_data: 'rounds_15' }, { text: '20 سوال', callback_data: 'rounds_20' }],
      [{ text: '🚀 شروع بازی!', callback_data: 'start_game' }]
    ]
  };
}

// ========== MESSAGE HANDLER ==========
async function handleMessage(msg, env) {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';
  const name = msg.from.first_name || 'Player';
  const userId = msg.from.id;

  if (text === '/start' || text === '/start@' + (await getBotUsername(env))) {
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
    if (isGroup) {
      await send(env, chatId,
        '━━━━━━━━━━━━━━━━━━━\n🎮 <b>کوئیز گروهی!</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
        '🎯 سوالات از ژانرهای مختلف\n👥 با دوستات بازی کن\n🏆 هر کی بیشتر جواب بده برنده‌ست!\n\n' +
        '━━━━━━━━━━━━━━━━━━━\n\n' +
        'دستورات:\n' +
        '/quiz — شروع بازی جدید\n' +
        '/score — امتیازات\n' +
        '/stop — پایان بازی',
        { inline_keyboard: [[{ text: '🎮 شروع کوئیز!', callback_data: 'new_quiz' }]] }
      );
    } else {
      await send(env, chatId,
        '━━━━━━━━━━━━━━━━━━━\n🎮 <b>ربات کوئیز گروهی!</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
        'من رو به یه گروه اد کن تا با دوستات بازی کنی!\n\n' +
        '🎯 سوالات از 8 ژانر مختلف\n👥 چند نفره\n🏆 لیدربورد و امتیازدهی',
      );
    }
    return;
  }

  if (text === '/quiz' || text === '/quiz@' + (await getBotUsername(env))) {
    const game = getGame(chatId);
    if (game.active) {
      await send(env, chatId, '⚠️ بازی در حال اجراست! اول /stop بزن.');
      return;
    }
    game.active = true;
    game.players = {};
    game.round = 0;
    game.answeredBy = new Set();
    await send(env, chatId,
      '━━━━━━━━━━━━━━━━━━━\n🎮 <b>بازی جدید!</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '📦 ژانر سوالات رو انتخاب کن:',
      getCategoryKeyboard()
    );
    return;
  }

  if (text === '/score' || text === '/score@' + (await getBotUsername(env))) {
    const game = getGame(chatId);
    await sendScoreboard(env, chatId, game);
    return;
  }

  if (text === '/stop' || text === '/stop@' + (await getBotUsername(env))) {
    const game = getGame(chatId);
    if (!game.active) {
      await send(env, chatId, '⚠️ بازی فعالی نیست.');
      return;
    }
    game.active = false;
    await sendFinalScoreboard(env, chatId, game);
    return;
  }

  if (text === '/help') {
    await send(env, chatId,
      '🎮 <b>راهنمای کوئیز</b>\n\n' +
      '/quiz — شروع بازی جدید\n' +
      '/score — امتیازات فعلی\n' +
      '/stop — پایان بازی و اعلام برنده\n' +
      '/help — راهنما\n\n' +
      '🎯 هر سوال 10 امتیاز داره\n' +
      '⚡ جواب سریع‌تر = امتیاز بیشتر\n' +
      '🏆 آخر بازی برنده اعلام میشه'
    );
    return;
  }
}

async function getBotUsername(env) {
  return 'Quizbgroupbot';
}

// ========== CALLBACK HANDLER ==========
async function handleCallback(cb, env) {
  const chatId = cb.message.chat.id;
  const data = cb.data;
  const userId = cb.from.id;
  const name = cb.from.first_name || 'Player';
  const msgId = cb.message.message_id;

  const game = getGame(chatId);

  // New quiz
  if (data === 'new_quiz') {
    if (game.active) {
      await answerCb(env, cb.id, 'بازی در حال اجراست!');
      return;
    }
    game.active = true;
    game.players = {};
    game.round = 0;
    game.answeredBy = new Set();
    await editMsg(env, chatId, msgId,
      '📦 <b>ژانر سوالات رو انتخاب کن:</b>', getCategoryKeyboard());
    await answerCb(env, cb.id);
    return;
  }

  // Category selection
  if (data.startsWith('cat_')) {
    game.category = data.replace('cat_', '');
    await editMsg(env, chatId, msgId,
      '━━━━━━━━━━━━━━━━━━━\n🎮 <b>تنظیمات بازی</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '📦 ژانر: <b>' + (game.category === 'all' ? 'همه' : CATEGORY_NAMES[game.category]) + '</b>\n' +
      '📊 تعداد سوال: <b>' + game.totalRounds + '</b>\n\n' +
      'تعداد سوال رو انتخاب کن:',
      getSettingsKeyboard());
    await answerCb(env, cb.id);
    return;
  }

  // Rounds selection
  if (data.startsWith('rounds_')) {
    game.totalRounds = parseInt(data.replace('rounds_', ''));
    await editMsg(env, chatId, msgId,
      '━━━━━━━━━━━━━━━━━━━\n🎮 <b>تنظیمات بازی</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '📦 ژانر: <b>' + (game.category === 'all' ? 'همه' : CATEGORY_NAMES[game.category]) + '</b>\n' +
      '📊 تعداد سوال: <b>' + game.totalRounds + '</b>\n\n' +
      'آماده‌ای؟',
      getSettingsKeyboard());
    await answerCb(env, cb.id);
    return;
  }

  // Start game
  if (data === 'start_game') {
    game.round = 0;
    game.answeredBy = new Set();
    await editMsg(env, chatId, msgId, '🚀 <b>بازی شروع شد!</b>\n\n⏳ سوال اول...');
    await sendQuestion(env, chatId, game);
    await answerCb(env, cb.id);
    return;
  }

  // Answer
  if (data.startsWith('ans_')) {
    if (!game.active || !game.currentQ) {
      await answerCb(env, cb.id, 'بازی فعال نیست!');
      return;
    }

    const parts = data.split('_');
    const qId = parts[1];
    const chosen = parseInt(parts[2]);

    // Check if already answered this question
    const playerKey = userId + '_' + qId;
    if (game.answeredBy.has(playerKey)) {
      await answerCb(env, cb.id, 'قبلاً جواب دادی!');
      return;
    }
    game.answeredBy.add(playerKey);

    // Initialize player
    if (!game.players[userId]) {
      game.players[userId] = { name, score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0 };
    }
    const player = game.players[userId];

    if (chosen === game.currentQ.correct) {
      // Correct answer - more points for faster answer
      const timeBonus = Math.max(1, 10 - Math.floor((Date.now() - game.currentQ.time) / 3000));
      const streakBonus = Math.min(player.streak * 2, 10);
      const points = timeBonus + streakBonus;
      player.score += points;
      player.correct++;
      player.streak++;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
      await answerCb(env, cb.id, '✅ درست! +' + points + ' امتیاز');
    } else {
      player.wrong++;
      player.streak = 0;
      await answerCb(env, cb.id, '❌ اشتباه!');
    }

    // Move to next question after short delay
    game.round++;
    if (game.round >= game.totalRounds) {
      // Game over
      game.active = false;
      setTimeout(async () => {
        await sendFinalScoreboard(env, chatId, game);
      }, 2000);
    } else {
      setTimeout(async () => {
        await sendQuestion(env, chatId, game);
      }, 3000);
    }
    return;
  }
}

// ========== GAME FUNCTIONS ==========
async function sendQuestion(env, chatId, game) {
  const q = getRandomQuestion(game.category);
  const qId = Math.random().toString(36).substring(2, 8);
  game.currentQ = { ...q, id: qId, time: Date.now() };
  game.answeredBy = new Set();

  const roundText = '━━━━━━━━━━━━━━━━━━━\n';
  const header = '🎯 <b>سوال ' + (game.round + 1) + '/' + game.totalRounds + '</b>\n';
  const catText = '📦 ژانر: ' + CATEGORY_NAMES[q.category] + '\n';
  const questionText = '\n' + q.q + '\n';
  const footer = '\n━━━━━━━━━━━━━━━━━━━';

  const msgId = await send(env, chatId,
    roundText + header + catText + questionText + footer,
    getQuestionKeyboard(qId, q.a)
  );
  game.questionMsgId = msgId;
}

async function sendScoreboard(env, chatId, game) {
  const players = Object.entries(game.players).sort((a, b) => b[1].score - a[1].score);
  if (!players.length) {
    await send(env, chatId, '📊 هنوز کسی بازی نکرده!');
    return;
  }

  let text = '━━━━━━━━━━━━━━━━━━━\n📊 <b>امتیازات</b>\n━━━━━━━━━━━━━━━━━━━\n\n';
  const medals = ['🥇', '🥈', '🥉'];
  players.forEach(([id, p], i) => {
    text += (medals[i] || '  ' + (i + 1) + '.') + ' <b>' + p.name + '</b> — ' + p.score + ' امتیاز (✅' + p.correct + ' ❌' + p.wrong + ')\n';
  });
  text += '\n━━━━━━━━━━━━━━━━━━━';
  await send(env, chatId, text);
}

async function sendFinalScoreboard(env, chatId, game) {
  const players = Object.entries(game.players).sort((a, b) => b[1].score - a[1].score);
  if (!players.length) {
    await send(env, chatId, '📊 بازی تموم شد ولی کسی بازی نکرد!');
    return;
  }

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

  // Reset game
  game.players = {};
  game.round = 0;

  await send(env, chatId, text, { inline_keyboard: [[{ text: '🔄 بازی جدید!', callback_data: 'new_quiz' }]] });
}
