CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,
  fails INTEGER NOT NULL,
  first_at INTEGER NOT NULL
);

CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  numero TEXT NOT NULL DEFAULT '',
  cliente TEXT NOT NULL DEFAULT '',
  titulo TEXT NOT NULL DEFAULT '',
  total REAL NOT NULL DEFAULT 0,
  sin_precio INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  share_token TEXT UNIQUE,
  shared_data TEXT,
  shared_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_budgets_user ON budgets(user_id, updated_at DESC);
