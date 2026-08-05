-- Conversations table
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  role TEXT NOT NULL,        -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for speed
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- User settings table
CREATE TABLE IF NOT EXISTS users (
  chat_id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  system_prompt TEXT,
  model TEXT DEFAULT 'gemini/gemini-3.5-flash-lite',
  agent_mode INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
