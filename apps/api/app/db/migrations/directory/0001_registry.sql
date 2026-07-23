-- The course registry (backend guide 3.1): directory.db holds cross-course
-- lookups; users, sessions, and seats join it in milestones 1.4 and 1.5.
CREATE TABLE courses (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
