-- Seats and their sessions (backend guide 7.1, milestone 1.5), plus course
-- ownership (seat management is owner-only; the full course model is Phase
-- 2.1). Codes are credentials: Argon2id hashes with a 4-character prefix
-- index for O(1) lookup; plaintext exists in exactly one response ever.
ALTER TABLE courses ADD COLUMN owner_id INTEGER REFERENCES users(id);

CREATE TABLE seats (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  seat_number TEXT NOT NULL,          -- 'S-001', displayed everywhere
  code_hash TEXT NOT NULL,            -- Argon2id
  code_prefix TEXT NOT NULL,          -- first 4 chars, lookup index only
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  UNIQUE (course_id, seat_number)
);
CREATE INDEX idx_seats_prefix ON seats(code_prefix);

-- Opaque server-side session tokens, course-scoped through the seat and
-- revocable instantly (auth checks seat status on every request).
CREATE TABLE seat_sessions (
  id INTEGER PRIMARY KEY,
  seat_id INTEGER NOT NULL REFERENCES seats(id),
  token_hash TEXT NOT NULL UNIQUE,    -- sha256; the token itself is 256-bit random
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX idx_seat_sessions_seat ON seat_sessions(seat_id);
