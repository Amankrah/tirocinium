-- The understanding unfold (frontend guide 4.2, milestone 8.4). The
-- professor's worked solution becomes available to a seat after they submit,
-- or on giving up, and then unfolds one step at a time. This table records
-- both facts per (seat, variant): whether the seat reached the solution by
-- giving up rather than by submitting, and how far they have unfolded it.
--
-- The step count is not a gate on the student (unfolding is free and
-- unlimited); it exists because the tutor is told how far the student has
-- read, so it can discuss a step they have seen and still never volunteer one
-- they have not. Seats are seats here as everywhere: seat_id references the
-- directory, and nothing about a student is stored beyond it.
CREATE TABLE solution_reveals (
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  seat_id INTEGER NOT NULL,
  gave_up INTEGER NOT NULL DEFAULT 0,   -- 1 when reached without a submission
  steps_revealed INTEGER NOT NULL DEFAULT 0,
  first_revealed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (variant_id, seat_id)
);
CREATE INDEX idx_solution_reveals_seat ON solution_reveals(seat_id);
