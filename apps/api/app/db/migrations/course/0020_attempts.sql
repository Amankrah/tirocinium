-- The attempt span (frontend guide 4.2, milestone 9.6). A student starting a
-- problem gets a "start attempt" moment, and the submission carries the
-- (started, submitted) span as an honest record of engaged time.
--
-- Honest is the operative word, and it is why the start is a server-recorded
-- row rather than a timestamp the client sends. A span the client can name is a
-- span the client can invent, and this one is shown to the professor. The seat
-- opens an attempt, the server stamps it, and a submission may reference the
-- attempt it came from; a submission with no attempt carries a null span rather
-- than a fabricated one.
--
-- Abandoned attempts are ordinary: a student may start a problem three times
-- and submit once. Nothing is cleaned up, because an unreferenced attempt is
-- just a row, and no attempt is evidence of anything on its own.
CREATE TABLE attempts (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  seat_id INTEGER NOT NULL,
  started_at INTEGER NOT NULL
);
CREATE INDEX idx_attempts_seat_variant ON attempts(seat_id, variant_id);

-- Denormalised onto the submission so every read that shows a submission can
-- show its span without joining, and so the span is frozen at submission time.
ALTER TABLE submissions ADD COLUMN started_at INTEGER;
