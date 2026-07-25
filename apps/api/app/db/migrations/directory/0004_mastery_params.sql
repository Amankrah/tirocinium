-- The active mastery parameter set (mastery spec sections 7 and 10, milestone
-- 6.3). Parameters live in the directory because they are platform state, not
-- course content: one active set at a time, every version kept, and every
-- cached mastery state records the version it was computed under
-- (mastery_state.params_version in each course shard), so the audit trail can
-- always say which numbers produced which labels. Activating a new version is
-- a deliberate act that ships with a full replay of every shard (the
-- migrate_mastery_params script); no row here means the crate's built-in
-- defaults are active under their own version id.
CREATE TABLE mastery_params (
  version TEXT PRIMARY KEY,
  params_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  activated_at INTEGER NOT NULL
);
