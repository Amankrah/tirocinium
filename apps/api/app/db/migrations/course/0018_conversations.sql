-- The voice defense conversation (backend guide 6.5, Phase 7). A conversation
-- is stateful within a session and ephemeral after it: the transcript is kept
-- compressed (like all text) with the tutor's closing rubric and the named
-- concept to revisit, for the student's history and the professor's
-- class-wide misconception view. Raw audio is never stored anywhere: no
-- column exists for it, deliberately. The rubric is the validated structured
-- verdict (mastery spec section 3); its per-concept gaps feed the
-- distribution's gaps verbatim.
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  seat_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'closed' | 'abandoned'
  transcript_z BLOB,                        -- zstd(dict=handwriting) turn JSON
  rubric_json TEXT,                         -- validated verdict, null if none survived
  concept_to_revisit INTEGER,
  turn_count INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE INDEX idx_conversations_submission ON conversations(submission_id);
CREATE INDEX idx_conversations_seat ON conversations(seat_id, started_at);

-- Speech-service accounting (guide 6.5: speech services dominate the cost, so
-- they are logged per course alongside the 6.4 token accounting). One row per
-- provider call or stream, in the course's own shard; unit names what amount
-- measures ('seconds' for STT audio, 'characters' for TTS input).
CREATE TABLE speech_usage (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,                       -- 'defense_stt' | 'defense_tts'
  provider TEXT NOT NULL,
  unit TEXT NOT NULL,
  amount REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_speech_usage_created ON speech_usage(created_at);
