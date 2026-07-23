-- Professor and admin accounts (backend guide 7.1, milestone 1.4). Only
-- professors have accounts; students are seats (1.5) and never appear here.
-- Emails are stored lowercased; uniqueness is therefore case-insensitive.
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,           -- Argon2id
  role TEXT NOT NULL DEFAULT 'professor' CHECK (role IN ('professor', 'admin')),
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
