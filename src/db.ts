// ============================================
// توابع دیتابیس D1
// ============================================

import { Env, ChatMessage } from './types';

// ذخیره پیام
export async function saveMessage(
  env: Env,
  chatId: number,
  role: string,
  content: string
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)'
  ).bind(chatId, role, content).run();
}

// گرفتن تاریخچه مکالمه (آخرین N پیام)
export async function getHistory(
  env: Env,
  chatId: number,
  limit: number = 20
): Promise<ChatMessage[]> {
  const { results } = await env.DB.prepare(
    'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?'
  ).bind(chatId, limit).all();

  if (!results) return [];

  // برعمش کن (جدیدترین آخر)
  return results.reverse().map((r: any) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }));
}

// ذخیره یا آپدیت کاربر
export async function upsertUser(
  env: Env,
  chatId: number,
  username?: string,
  firstName?: string
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (chat_id, username, first_name, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(chat_id) DO UPDATE SET
       username = excluded.username,
       first_name = excluded.first_name,
       updated_at = datetime('now')`
  ).bind(chatId, username || null, firstName || null).run();
}

// گرفتن تنظیمات کاربر
export async function getUserSettings(
  env: Env,
  chatId: number
): Promise<{ system_prompt: string | null; model: string } | null> {
  const row = await env.DB.prepare(
    'SELECT system_prompt, model FROM users WHERE chat_id = ?'
  ).bind(chatId).first();
  return row as any;
}

// پاک کردن تاریخچه مکالمه
export async function clearHistory(env: Env, chatId: number): Promise<void> {
  await env.DB.prepare('DELETE FROM messages WHERE chat_id = ?')
    .bind(chatId).run();
}

// آپدیت سیستم پرامپت کاربر
export async function updateSystemPrompt(
  env: Env,
  chatId: number,
  prompt: string
): Promise<void> {
  await env.DB.prepare(
    `UPDATE users SET system_prompt = ?, updated_at = datetime('now') WHERE chat_id = ?`
  ).bind(prompt, chatId).run();
}

// آپدیت مدل کاربر
export async function updateModel(
  env: Env,
  chatId: number,
  model: string
): Promise<void> {
  await env.DB.prepare(
    `UPDATE users SET model = ?, updated_at = datetime('now') WHERE chat_id = ?`
  ).bind(model, chatId).run();
}
