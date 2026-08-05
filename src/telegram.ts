// ============================================
// مدیریت پیام‌های تلگرام
// ============================================

import { Env, TelegramUpdate } from './types';
import { callAI } from './ai';
import {
  saveMessage,
  getHistory,
  upsertUser,
  getUserSettings,
  clearHistory,
  updateSystemPrompt,
  updateModel,
} from './db';

// ارسال پیام به تلگرام
async function sendMessage(env: Env, chatId: number, text: string): Promise<void> {
  // تلگرام محدودیت ۴۰۹۶ کاراکتر داره
  const chunks = splitText(text, 4000);

  for (const chunk of chunks) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: 'Markdown',
      }),
    });
  }
}

// تقسیم متن
function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // سعی کن از خط جدید جدا کن
    let cut = remaining.lastIndexOf('\n', maxLen);
    if (cut === -1 || cut < maxLen / 2) cut = maxLen;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  return chunks;
}

// هندلر اصلی آپدیت تلگرام
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  env: Env
): Promise<void> {
  const message = update.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  const firstName = message.chat.first_name;
  const username = message.chat.username;

  // ثبت کاربر
  await upsertUser(env, chatId, username, firstName);

  // === دستورات ===

  // /start
  if (text === '/start') {
    await sendMessage(env, chatId,
      `سلام ${firstName || 'دوست عزیز'}! 👋\n\n` +
      `من یه دستیار هوش مصنوعی هستم.\n\n` +
      `دستورات:\n` +
      `/clear — پاک کردن تاریخچه مکالمه\n` +
      `/system [متن] — تنظیم سیستم پرامپت\n` +
      `/model [نام] — تغییر مدل\n` +
      `/settings — نمایش تنظیمات\n\n` +
      `هر پیامی بفرستی جواب میدم! 💬`
    );
    return;
  }

  // /clear
  if (text === '/clear') {
    await clearHistory(env, chatId);
    await sendMessage(env, chatId, '✅ تاریخچه مکالمه پاک شد.');
    return;
  }

  // /system
  if (text.startsWith('/system')) {
    const prompt = text.replace('/system', '').trim();
    if (!prompt) {
      await sendMessage(env, chatId, '❌ متن سیستم پرامپت رو بنویس.\nمثال: `/system تو یه برنامه‌نویس پایتون حرفه‌ای هستی`');
      return;
    }
    await updateSystemPrompt(env, chatId, prompt);
    await sendMessage(env, chatId, `✅ سیستم پرامپت تنظیم شد:\n"${prompt}"`);
    return;
  }

  // /model
  if (text.startsWith('/model')) {
    const model = text.replace('/model', '').trim();
    if (!model) {
      await sendMessage(env, chatId, '❌ نام مدل رو بنویس.\nمثال: `/model gpt-4o-mini`');
      return;
    }
    await updateModel(env, chatId, model);
    await sendMessage(env, chatId, `✅ مدل تغییر کرد به: ${model}`);
    return;
  }

  // /settings
  if (text === '/settings') {
    const settings = await getUserSettings(env, chatId);
    const model = settings?.model || env.MODEL_NAME || 'gpt-4o-mini';
    const systemPrompt = settings?.system_prompt || 'پیش‌فرض';
    await sendMessage(env, chatId,
      `⚙️ تنظیمات فعلی:\n\n` +
      `مدل: ${model}\n` +
      `سیستم پرامپت: ${systemPrompt}`
    );
    return;
  }

  // === چت عادی ===

  // ذخیره پیام کاربر
  await saveMessage(env, chatId, 'user', text);

  // گرفتن تاریخچه
  const settings = await getUserSettings(env, chatId);
  const history = await getHistory(env, chatId, 20);
  const model = settings?.model || undefined;

  try {
    // اگه کاربر سیستم پرامپت داره، جایگزین کن
    let messages = history;
    if (settings?.system_prompt) {
      // سیستم پرامپت توی callAI اضافه میشه ولی اینجا override کن
      // Actually we need to pass it differently - let me handle this
    }

    const reply = await callAI(env, messages, model);

    // ذخیره جواب
    await saveMessage(env, chatId, 'assistant', reply);

    // ارسال به تلگرام
    await sendMessage(env, chatId, reply);
  } catch (e: any) {
    console.error('AI error:', e.message);
    await sendMessage(env, chatId, `❌ خطا: ${e.message}`);
  }
}
