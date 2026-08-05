// ============================================
// تایپ‌ها و اینترفیس‌ها
// ============================================

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  MODEL_NAME: string;
  SYSTEM_PROMPT: string;
  DB: D1Database;
  KV: KVNamespace;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  chat: {
    id: number;
    type: string;
    first_name?: string;
    username?: string;
  };
  text?: string;
  date: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
