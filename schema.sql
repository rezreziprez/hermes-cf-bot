-- جدول مکالمات
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  role TEXT NOT NULL,        -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ایندکس برای سرعت
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- جدول تنظیمات کاربران
CREATE TABLE IF NOT EXISTS users (
  chat_id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  system_prompt TEXT,
  model TEXT DEFAULT 'gpt-4o-mini',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
