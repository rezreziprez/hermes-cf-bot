// Hermes Gaming Bot - Cloudflare Worker
// Multi-game Telegram bot with leaderboard

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
    return new Response('Gaming Bot Active', { status: 200 });
  },
};

// ========== CONFIGURATION ==========
const GAMES = {
  guess: { name: '🎯 حدس عدد', desc: 'یه عدد بین 1 تا 100 حدس بزن', icon: '🎯' },
  rps: { name: '✊ سنگ کاغذ قیچی', desc: 'بازی کن و ببر!', icon: '✊' },
  trivia: { name: '❓ ترامیویا', desc: 'دانشت رو بسنج', icon: '❓' },
  math: { name: '🧮 چالش ریاضی', desc: 'سریع حساب کن', icon: '🧮' },
  dice: { name: '🎲 تاس', desc: 'تاس بنداز', icon: '🎲' },
  coin: { name: '🪙 سکه', desc: 'شیر یا خط', icon: '🪙' },
  slots: { name: '🎰 اسلات', desc: 'شانست رو امتحان کن', icon: '🎰' },
  word: { name: '📝 حدس کلمه', desc: 'کلمه رو حدس بزن', icon: '📝' },
};

// Simple word list for word game
const WORDS = ['apple', 'banana', 'cherry', 'dragon', 'eagle', 'falcon', 'grape', 'honey', 'igloo', 'jungle',
  'knight', 'lemon', 'mango', 'night', 'ocean', 'piano', 'queen', 'river', 'storm', 'tiger'];

// ========== HELPERS ==========
async function send(env, chatId, text, keyboard) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (keyboard) body.reply_markup = keyboard;
  await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
}

async function editMessage(env, chatId, messageId, text, keyboard) {
  const body = { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' };
  if (keyboard) body.reply_markup = keyboard;
  await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/editMessageText', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
}

async function answerCallback(env, callbackId, text) {
  await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/answerCallbackQuery', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, text, show_alert: false })
  });
}

async function getUser(env, chatId, name) {
  const user = await env.DB.prepare('SELECT * FROM users WHERE chat_id = ?').bind(chatId).first();
  if (!user) {
    await env.DB.prepare('INSERT INTO users (chat_id, username, score, wins, losses, games_played, streak, best_streak) VALUES (?, ?, 0, 0, 0, 0, 0, 0)').bind(chatId, name).run();
    return { chat_id: chatId, username: name, score: 0, wins: 0, losses: 0, games_played: 0, streak: 0, best_streak: 0 };
  }
  return user;
}

async function updateScore(env, chatId, points, isWin) {
  const user = await env.DB.prepare('SELECT * FROM users WHERE chat_id = ?').bind(chatId).first();
  if (!user) return;
  const newScore = user.score + points;
  const newWins = isWin ? user.wins + 1 : user.wins;
  const newLosses = isWin ? user.losses : user.losses + 1;
  const newGames = user.games_played + 1;
  const newStreak = isWin ? user.streak + 1 : 0;
  const newBest = Math.max(user.best_streak, newStreak);
  await env.DB.prepare('UPDATE users SET score=?, wins=?, losses=?, games_played=?, streak=?, best_streak=? WHERE chat_id=?')
    .bind(newScore, newWins, newLosses, newGames, newStreak, newBest, chatId).run();
}

// ========== KEYBOARDS ==========
function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '🎯 حدس عدد', callback_data: 'play_guess' }, { text: '✊ سنگ کاغذ قیچی', callback_data: 'play_rps' }],
      [{ text: '❓ ترامیویا', callback_data: 'play_trivia' }, { text: '🧮 چالش ریاضی', callback_data: 'play_math' }],
      [{ text: '🎲 تاس', callback_data: 'play_dice' }, { text: '🪙 سکه', callback_data: 'play_coin' }],
      [{ text: '🎰 اسلات', callback_data: 'play_slots' }, { text: '📝 حدس کلمه', callback_data: 'play_word' }],
      [{ text: '🏆 لیدربورد', callback_data: 'leaderboard' }, { text: '👤 پروفایل', callback_data: 'profile' }],
      [{ text: '📊 آمار', callback_data: 'stats' }]
    ]
  };
}

function rpsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✊ سنگ', callback_data: 'rps_rock' }, { text: '📄 کاغذ', callback_data: 'rps_paper' }, { text: '✌️ قیچی', callback_data: 'rps_scissors' }],
      [{ text: '🔙 بازگشت', callback_data: 'back_menu' }]
    ]
  };
}

function guessKeyboard() {
  const rows = [];
  for (let i = 1; i <= 100; i += 10) {
    const row = [];
    for (let j = i; j < i + 10 && j <= 100; j++) {
      row.push({ text: String(j), callback_data: 'guess_' + j });
    }
    rows.push(row);
  }
  rows.push([{ text: '🔙 بازگشت', callback_data: 'back_menu' }]);
  return { inline_keyboard: rows };
}

function slotsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🎰 بچرخون!', callback_data: 'slots_spin' }],
      [{ text: '🔙 بازگشت', callback_data: 'back_menu' }]
    ]
  };
}

// ========== MESSAGE HANDLER ==========
async function handleMessage(msg, env) {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';
  const name = msg.from.first_name || 'Player';

  if (text === '/start' || text === '/start@gaming_bot') {
    await getUser(env, chatId, name);
    await send(env, chatId,
      '━━━━━━━━━━━━━━━━━━━\n🎮 <b>به Gaming Bot خوش آمدید!</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '🎯 حدس عدد\n✊ سنگ کاغذ قیچی\n❓ ترامیویا\n🧮 چالش ریاضی\n🎲 تاس\n🪙 سکه\n🎰 اسلات\n📝 حدس کلمه\n\n' +
      '━━━━━━━━━━━━━━━━━━━\n🏆 <b>لیدربورد</b> — ببین کی بهتره!\n👤 <b>پروفایل</b> — آمار بازی‌هات\n━━━━━━━━━━━━━━━━━━━',
      mainMenu()
    );
    return;
  }

  if (text === '/help') {
    await send(env, chatId,
      '🎮 <b>راهنمای بازی‌ها</b>\n\n' +
      '🎯 حدس عدد: یه عدد بین 1 تا 100 حدس بزن\n' +
      '✊ سنگ کاغذ قیچی: بازی کلاسیک\n' +
      '❓ ترامیویا: سوالات عمومی\n' +
      '🧮 چالش ریاضی: محاسبه سریع\n' +
      '🎲 تاس: شانست رو امتحان کن\n' +
      '🪙 سکه: شیر یا خط\n' +
      '🎰 اسلات: ماشین اسلات\n' +
      '📝 حدس کلمه: کلمه مخفی رو پیدا کن\n\n' +
      '🏆 امتیاز بگیر و تو لیدربورد بالا برو!',
      mainMenu()
    );
    return;
  }

  // Handle text input for word game
  if (msg.reply_to_message && msg.reply_to_message.text && msg.reply_to_message.text.includes('حدس بزن')) {
    const word = await env.DB.prepare('SELECT word FROM word_games WHERE chat_id = ? AND active = 1').bind(chatId).first();
    if (word) {
      const guess = text.toLowerCase();
      if (guess === word.word) {
        await env.DB.prepare('UPDATE word_games SET active = 0 WHERE chat_id = ?').bind(chatId).run();
        await updateScore(env, chatId, 20, true);
        await send(env, chatId, '✅ <b>آفرین!</b> کلمه درست بود: <b>' + word.word + '</b>\n\n🏆 +20 امتیاز', mainMenu());
      } else {
        // Show hint
        let hint = '';
        for (let i = 0; i < word.word.length; i++) {
          if (i < guess.length && word.word[i] === guess[i]) hint += word.word[i];
          else hint += '_';
        }
        await send(env, chatId, '❌ نه! حدست اشتباه بود.\n\n💡 راهنما: <code>' + hint + '</code>\n📝 حروف: ' + word.word.length + ' تا\n\nدوباره حدس بزن!');
      }
    }
    return;
  }
}

// ========== CALLBACK HANDLER ==========
async function handleCallback(cb, env) {
  const chatId = cb.message.chat.id;
  const data = cb.data;
  const name = cb.from.first_name || 'Player';
  const msgId = cb.message.message_id;

  await getUser(env, chatId, name);

  // Back to menu
  if (data === 'back_menu') {
    await editMessage(env, chatId, msgId,
      '🎮 <b>منوی بازی‌ها</b>\n\nیه بازی انتخاب کن!', mainMenu());
    await answerCallback(env, cb.id);
    return;
  }

  // Profile
  if (data === 'profile') {
    const user = await env.DB.prepare('SELECT * FROM users WHERE chat_id = ?').bind(chatId).first();
    const level = Math.floor(user.score / 100) + 1;
    const xp = user.score % 100;
    await editMessage(env, chatId, msgId,
      '👤 <b>پروفایل</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '🏷️ نام: <b>' + user.username + '</b>\n' +
      '🏆 امتیاز: <b>' + user.score + '</b>\n' +
      '📊 سطح: <b>' + level + '</b> (' + xp + '/100 XP)\n' +
      '✅ برد: <b>' + user.wins + '</b>\n' +
      '❌ باخت: <b>' + user.losses + '</b>\n' +
      '🎮 بازی‌ها: <b>' + user.games_played + '</b>\n' +
      '🔥 استریک: <b>' + user.streak + '</b>\n' +
      '⭐ بهترین استریک: <b>' + user.best_streak + '</b>\n\n' +
      '━━━━━━━━━━━━━━━━━━━',
      { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'back_menu' }]] }
    );
    await answerCallback(env, cb.id);
    return;
  }

  // Leaderboard
  if (data === 'leaderboard') {
    const leaders = await env.DB.prepare('SELECT username, score, wins, games_played FROM users ORDER BY score DESC LIMIT 10').all();
    let lb = '🏆 <b>لیدربورد</b>\n━━━━━━━━━━━━━━━━━━━\n\n';
    const medals = ['🥇', '🥈', '🥉'];
    leaders.results.forEach((u, i) => {
      lb += (medals[i] || (i + 1) + '.') + ' <b>' + u.username + '</b> — ' + u.score + ' امتیاز (' + u.wins + ' برد)\n';
    });
    if (!leaders.results.length) lb += 'هنوز کسی بازی نکرده!\n';
    lb += '\n━━━━━━━━━━━━━━━━━━━';
    await editMessage(env, chatId, msgId, lb, { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'back_menu' }]] });
    await answerCallback(env, cb.id);
    return;
  }

  // Stats
  if (data === 'stats') {
    const total = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first();
    const totalGames = await env.DB.prepare('SELECT SUM(games_played) as g FROM users').first();
    const topStreak = await env.DB.prepare('SELECT username, best_streak FROM users ORDER BY best_streak DESC LIMIT 1').first();
    await editMessage(env, chatId, msgId,
      '📊 <b>آمار کلی</b>\n━━━━━━━━━━━━━━━━━━━\n\n' +
      '👥 بازیکنان: <b>' + (total?.c || 0) + '</b>\n' +
      '🎮 کل بازی‌ها: <b>' + (totalGames?.g || 0) + '</b>\n' +
      '🔥 بهترین استریک: <b>' + (topStreak?.best_streak || 0) + '</b> (' + (topStreak?.username || '-') + ')\n\n' +
      '━━━━━━━━━━━━━━━━━━━',
      { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'back_menu' }]] }
    );
    await answerCallback(env, cb.id);
    return;
  }

  // ========== GUESS NUMBER ==========
  if (data === 'play_guess') {
    const num = Math.floor(Math.random() * 100) + 1;
    await env.DB.prepare('DELETE FROM guess_games WHERE chat_id = ?').bind(chatId).run();
    await env.DB.prepare('INSERT INTO guess_games (chat_id, number, tries) VALUES (?, ?, 0)').bind(chatId, num).run();
    await editMessage(env, chatId, msgId, '🎯 <b>حدس عدد</b>\n\nیه عدد بین 1 تا 100 انتخاب شده!\nحدس بزن:', guessKeyboard());
    await answerCallback(env, cb.id);
    return;
  }

  if (data.startsWith('guess_')) {
    const guess = parseInt(data.replace('guess_', ''));
    const game = await env.DB.prepare('SELECT * FROM guess_games WHERE chat_id = ?').bind(chatId).first();
    if (!game) { await answerCallback(env, cb.id, 'بازی تموم شده!'); return; }

    const newTries = game.tries + 1;
    await env.DB.prepare('UPDATE guess_games SET tries = ? WHERE chat_id = ?').bind(newTries, chatId).run();

    if (guess === game.number) {
      await env.DB.prepare('DELETE FROM guess_games WHERE chat_id = ?').bind(chatId).run();
      const points = Math.max(20 - newTries * 2, 5);
      await updateScore(env, chatId, points, true);
      await editMessage(env, chatId, msgId,
        '🎉 <b>آفرین!</b> عدد درست بود: <b>' + game.number + '</b>\n\n📊 تعداد تلاش: ' + newTries + '\n🏆 +' + points + ' امتیاز',
        { inline_keyboard: [[{ text: '🔄 بازی جدید', callback_data: 'play_guess' }], [{ text: '🔙 بازگشت', callback_data: 'back_menu' }]] }
      );
      await answerCallback(env, cb.id, '🎉 بردی!');
    } else if (guess < game.number) {
      await editMessage(env, chatId, msgId,
        '📈 <b>بالاتر!</b>\n\nعدد: ' + guess + '\nتلاش: ' + newTries + '\n\nحدس بزن:', guessKeyboard());
      await answerCallback(env, cb.id, '📈 بالاتر!');
    } else {
      await editMessage(env, chatId, msgId,
        '📉 <b>پایین‌تر!</b>\n\nعدد: ' + guess + '\nتلاش: ' + newTries + '\n\nحدس بزن:', guessKeyboard());
      await answerCallback(env, cb.id, '📉 پایین‌تر!');
    }
    return;
  }

  // ========== ROCK PAPER SCISSORS ==========
  if (data === 'play_rps') {
    await editMessage(env, chatId, msgId, '✊ <b>سنگ کاغذ قیچی</b>\n\nانتخاب کن:', rpsKeyboard());
    await answerCallback(env, cb.id);
    return;
  }

  if (data.startsWith('rps_')) {
    const player = data === 'rps_rock' ? 0 : data === 'rps_paper' ? 1 : 2;
    const ai = Math.floor(Math.random() * 3);
    const names = ['✊ سنگ', '📄 کاغذ', '✌️ قیچی'];
    const result = player === ai ? 'draw' : (player + 1) % 3 === ai ? 'win' : 'lose';
    const points = result === 'win' ? 10 : result === 'draw' ? 3 : 0;

    await updateScore(env, chatId, points, result === 'win');
    const emoji = result === 'win' ? '🎉' : result === 'draw' ? '🤝' : '😔';
    const text = result === 'win' ? 'بردی!' : result === 'draw' ? 'مساوی!' : 'باختی!';

    await editMessage(env, chatId, msgId,
      emoji + ' <b>' + text + '</b>\n\n' +
      'شما: ' + names[player] + '\n' +
      'AI: ' + names[ai] + '\n\n' +
      '🏆 +' + points + ' امتیاز',
      { inline_keyboard: [[{ text: '🔄 دوباره', callback_data: 'play_rps' }], [{ text: '🔙 بازگشت', callback_data: 'back_menu' }]] }
    );
    await answerCallback(env, cb.id, emoji + ' ' + text);
    return;
  }

  // ========== TRIVIA ==========
  if (data === 'play_trivia') {
    const questions = [
      { q: 'پایتخت ایران چیه؟', a: ['تهران', 'اصفهان', 'شیراز', 'تبریز'], correct: 0 },
      { q: 'بزرگترین سیاره منظومه شمسی؟', a: ['مشتری', 'زحل', 'مریخ', 'نپتون'], correct: 0 },
      { q: 'چند قاره داریم؟', a: ['7', '5', '6', '8'], correct: 0 },
      { q: 'سریعترین حیوان؟', a: 'شاهین,یوزپلنگ,عقاب,اسب'.split(','), correct: 0 },
      { q: 'بلندترین کوه جهان؟', a: 'اورست,کی2,کانچنجونگا,ماکالو'.split(','), correct: 0 },
      { q: 'بزرگترین اقیانوس؟', a: 'آرام,اطلس,هند,منجمد'.split(','), correct: 0 },
      { q: 'کدام فلز مایع است؟', a: 'جیوه,آهن,طلا,نقره'.split(','), correct: 0 },
      { q: 'کدام سیاره سرخ است؟', a: 'مریخ,مشتری,زحل,عطارد'.split(','), correct: 0 },
    ];
    const q = questions[Math.floor(Math.random() * questions.length)];
    const qId = Math.random().toString(36).substring(2, 8);
    await env.DB.prepare('DELETE FROM trivia_games WHERE chat_id = ?').bind(chatId).run();
    await env.DB.prepare('INSERT INTO trivia_games (chat_id, qid, answer) VALUES (?, ?, ?)').bind(chatId, qId, q.correct).run();

    const buttons = q.a.map((a, i) => [{ text: a, callback_data: 'trivia_' + qId + '_' + i }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'back_menu' }]);
    await editMessage(env, chatId, msgId, '❓ <b>ترامیویا</b>\n\n' + q.q, { inline_keyboard: buttons });
    await answerCallback(env, cb.id);
    return;
  }

  if (data.startsWith('trivia_')) {
    const parts = data.split('_');
    const chosen = parseInt(parts[2]);
    const game = await env.DB.prepare('SELECT * FROM trivia_games WHERE chat_id = ? AND qid = ?').bind(chatId, parts[1]).first();
    if (!game) { await answerCallback(env, cb.id, 'بازی تموم شده!'); return; }

    await env.DB.prepare('DELETE FROM trivia_games WHERE chat_id = ?').bind(chatId).run();
    if (chosen === game.answer) {
      await updateScore(env, chatId, 15, true);
      await editMessage(env, chatId, msgId, '✅ <b>درست!</b>\n\n🏆 +15 امتیاز',
        { inline_keyboard: [[{ text: '🔄 سوال بعدی', callback_data: 'play_trivia' }], [{ text: '🔙 بازگشت', callback_data: 'back_menu' }]] });
      await answerCallback(env, cb.id, '✅ درسته!');
    } else {
      await updateScore(env, chatId, 0, false);
      await editMessage(env, chatId, msgId, '❌ <b>اشتباه!</b>\n\nجواب درست: ' + ['تهران', 'مشتری', '7', 'شاهین', 'اورست', 'آرام', 'جیوه', 'مریخ'][game.answer],
        { inline_keyboard: [[{ text: '🔄 سوال بعدی', callback_data: 'play_trivia' }], [{ text: '🔙 بازگشت', callback_data: 'back_menu' }]] });
      await answerCallback(env, cb.id, '❌ اشتباه!');
    }
    return;
  }

  // ========== MATH CHALLENGE ==========
  if (data === 'play_math') {
    const ops = ['+', '-', '*'];
    const op = ops[Math.floor(Math.random() * 3)];
    const a = Math.floor(Math.random() * 50) + 1;
    const b = Math.floor(Math.random() * 50) + 1;
    const answer = eval(a + op + b);
    const qId = Math.random().toString(36).substring(2, 8);
    await env.DB.prepare('DELETE FROM math_games WHERE chat_id = ?').bind(chatId).run();
    await env.DB.prepare('INSERT INTO math_games (chat_id, qid, answer) VALUES (?, ?, ?)').bind(chatId, qId, answer).run();

    // Generate 4 options including the correct one
    const options = [answer];
    while (options.length < 4) {
      const fake = answer + Math.floor(Math.random() * 20) - 10;
      if (!options.includes(fake) && fake !== answer) options.push(fake);
    }
    options.sort(() => Math.random() - 0.5);

    const buttons = options.map(o => [{ text: String(o), callback_data: 'math_' + qId + '_' + o }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'back_menu' }]);
    await editMessage(env, chatId, msgId, '🧮 <b>چالش ریاضی</b>\n\n' + a + ' ' + op + ' ' + b + ' = ?', { inline_keyboard: buttons });
    await answerCallback(env, cb.id);
    return;
  }

  if (data.startsWith('math_')) {
    const parts = data.split('_');
    const chosen = parseInt(parts[2]);
    const game = await env.DB.prepare('SELECT * FROM math_games WHERE chat_id = ? AND qid = ?').bind(chatId, parts[1]).first();
    if (!game) { await answerCallback(env, cb.id, 'بازی تموم شده!'); return; }

    await env.DB.prepare('DELETE FROM math_games WHERE chat_id = ?').bind(chatId).run();
    if (chosen === game.answer) {
      await updateScore(env, chatId, 10, true);
      await editMessage(env, chatId, msgId, '✅ <b>درست!</b> جواب: ' + game.answer + '\n\n🏆 +10 امتیاز',
        { inline_keyboard: [[{ text: '🔄 سوال بعدی', callback_data: 'play_math' }], [{ text: '🔙 بازگشت', callback_data: 'back_menu' }]] });
      await answerCallback(env, cb.id, '✅ درسته!');
    } else {
      await updateScore(env, chatId, 0, false);
      await editMessage(env, chatId, msgId, '❌ <b>اشتباه!</b> جواب: ' + game.answer,
        { inline_keyboard: [[{ text: '🔄 سوال بعدی', callback_data: 'play_math' }], [{ text: '🔙 بازگشت', callback_data: 'back_menu' }]] });
      await answerCallback(env, cb.id, '❌ اشتباه!');
    }
    return;
  }

  // ========== DICE ==========
  if (data === 'play_dice') {
    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    const total = dice1 + dice2;
    const diceEmoji = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    const points = total === 12 ? 20 : total >= 10 ? 10 : total >= 7 ? 5 : 2;
    const isWin = total >= 10;
    await updateScore(env, chatId, points, isWin);

    await editMessage(env, chatId, msgId,
      '🎲 <b>نتیجه تاس</b>\n\n' +
      diceEmoji[dice1 - 1] + ' ' + dice1 + ' + ' + diceEmoji[dice2 - 1] + ' ' + dice2 + ' = <b>' + total + '</b>\n\n' +
      '🏆 +' + points + ' امتیاز\n' +
      (isWin ? '🎉 عالی!' : '😔 بدشانسی!'),
      { inline_keyboard: [[{ text: '🎲 دوباره', callback_data: 'play_dice' }], [{ text: '🔙 بازگشت', callback_data: 'back_menu' }]] }
    );
    await answerCallback(env, cb.id, '🎲 ' + total);
    return;
  }

  // ========== COIN FLIP ==========
  if (data === 'play_coin') {
    const result = Math.random() < 0.5 ? 'شیر 🦁' : 'خط 📏';
    const points = 5;
    await updateScore(env, chatId, points, true);

    await editMessage(env, chatId, msgId,
      '🪙 <b>نتیجه سکه</b>\n\n' + result + '\n\n🏆 +' + points + ' امتیاز',
      { inline_keyboard: [[{ text: '🪙 دوباره', callback_data: 'play_coin' }], [{ text: '🔙 بازگشت', callback_data: 'back_menu' }]] }
    );
    await answerCallback(env, cb.id, '🪙 ' + result);
    return;
  }

  // ========== SLOTS ==========
  if (data === 'play_slots') {
    await editMessage(env, chatId, msgId, '🎰 <b>اسلات</b>\n\nبرای چرخاندن دکمه رو بزن!', slotsKeyboard());
    await answerCallback(env, cb.id);
    return;
  }

  if (data === 'slots_spin') {
    const symbols = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣', '⭐'];
    const s1 = symbols[Math.floor(Math.random() * symbols.length)];
    const s2 = symbols[Math.floor(Math.random() * symbols.length)];
    const s3 = symbols[Math.floor(Math.random() * symbols.length)];

    let points = 0;
    let msg = '';
    if (s1 === s2 && s2 === s3) {
      points = s1 === '💎' ? 100 : s1 === '7️⃣' ? 50 : 30;
      msg = '🎉 <b>جکپات!</b>';
    } else if (s1 === s2 || s2 === s3 || s1 === s3) {
      points = 10;
      msg = '😊 <b>دو تا یکسان!</b>';
    } else {
      points = 2;
      msg = '😔 <b>بدشانسی!</b>';
    }

    await updateScore(env, chatId, points, points >= 10);
    await editMessage(env, chatId, msgId,
      '🎰 <b>نتیجه اسلات</b>\n\n' +
      '┌─────────┐\n' +
      '│  ' + s1 + '  ' + s2 + '  ' + s3 + '  │\n' +
      '└─────────┘\n\n' +
      msg + '\n🏆 +' + points + ' امتیاز',
      { inline_keyboard: [[{ text: '🎰 دوباره', callback_data: 'slots_spin' }], [{ text: '🔙 بازگشت', callback_data: 'back_menu' }]] }
    );
    await answerCallback(env, cb.id, msg);
    return;
  }

  // ========== WORD GAME ==========
  if (data === 'play_word') {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    await env.DB.prepare('DELETE FROM word_games WHERE chat_id = ?').bind(chatId).run();
    await env.DB.prepare('INSERT INTO word_games (chat_id, word, active) VALUES (?, ?, 1)').bind(chatId, word).run();

    // Show hints
    const hint = word[0] + '_ '.repeat(word.length - 1);
    await send(env, chatId,
      '📝 <b>حدس کلمه</b>\n\n' +
      'کلمه ' + word.length + ' حرفیه:\n' +
      '<code>' + hint + '</code>\n\n' +
      'حرف اول: <b>' + word[0].toUpperCase() + '</b>\n\n' +
      'جوابتو ریپلای کن به این پیام!',
      { force_reply: true }
    );
    await answerCallback(env, cb.id);
    return;
  }
}
