# 0053: the backup drill on a schedule, with alerting

Milestone 9.4 promotes the restore drill from a per-push CI job to a scheduled
one with alerting, and the reason it is not merely a cron entry pointing at the
existing script is that the existing script cannot see the failure that matters
most. The drill builds its own fixture, replicates it, and restores it, which
proves the mechanism; it says nothing about whether last night's snapshot job
actually ran, or ran and wrote nothing. A backup nobody checks is a backup
nobody has, so 9.4 adds the other half: `verify_snapshots` in `app/db/backup.py`
lists the snapshot bucket, finds the newest object per shard, and fails when one
is missing, stale, or zero bytes, with `scripts/verify_backups.py` as the
command the job runs. Three choices inside it are worth stating. Shards come
from discovery over the data directory rather than from a configured list, so a
course created after the job was last touched reports as unbacked instead of
being silently absent from the result, and discovering no shards at all exits
non-zero rather than reporting a green run, because verifying nothing is not
verification. The freshness window is 36 hours: wide enough that one late run is
not noise, narrow enough that a missed night is caught the following morning.
And a zero-byte snapshot fails even when fresh, because a truncated upload is
worse than a missing one, since it looks like success. The alerting is a GitHub
issue opened on failure, or a comment on the already-open one so a week of
failures is one thread rather than seven, closed automatically when the drill
goes green again; a webhook is posted to as well when `TIRO_ALERT_WEBHOOK` is
configured, so the job is useful before anyone wires a pager rather than
depending on one. Both halves were proven against real MinIO rather than only
in theory, including the failure path (an unbacked shard exits 1 and names
itself). One unrelated defect surfaced while wiring this: `infra/setup.sh` and
`infra/restore-drill.sh` were recorded in git as non-executable, almost
certainly from Windows checkouts, while `ci.yml` invokes both as
`./infra/...`, so those jobs would have failed with a permission error. The
mode is fixed here.
