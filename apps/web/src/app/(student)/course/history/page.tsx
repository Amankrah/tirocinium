import Link from "next/link";
import { notFound } from "next/navigation";

import { getHistory } from "@/lib/api/unfold";
import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../../student-shell";
import { strings } from "../../strings";

// The seat's own record (guide 4.2b, milestone 8.4): effort made legible to the
// person who did it. A Server Component, so this route ships no client
// JavaScript; paging is a link with a cursor rather than an infinite scroll,
// which the guide rules out along with streaks and leaderboards. Nothing here
// ranks or compares: it is one seat's own work, newest first.
const s = strings.history;

function formatDate(at: number): string {
  return new Date(at * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { seat, token } = await requireSeat();
  const { cursor } = await searchParams;

  const from = Number(cursor);
  const history = await getHistory(token, seat.course_id, {
    ...(Number.isInteger(from) && from > 0 ? { cursor: from } : {}),
  });
  if (!history) notFound();

  return (
    <StudentShell seatNumber={seat.seat_number}>
      <div className="mx-auto flex w-full max-w-[var(--measure-reading)] flex-col gap-8 px-6 py-12">
        <Link
          href="/course"
          className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {strings.problem.backToCourse}
        </Link>
        <h1 className="font-display text-4xl">{s.heading}</h1>

        {history.entries.length === 0 ? (
          <p className="text-ink-muted">{s.empty}</p>
        ) : (
          <ol className="flex flex-col">
            {history.entries.map((entry) => (
              <li
                key={entry.submission_id}
                className="flex flex-col gap-1 border-b border-rule-line py-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-ink">{entry.case_study_title}</span>
                  <span className="text-sm tabular-nums text-ink-muted">
                    {s.submitted(formatDate(entry.submitted_at))}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                  <span className="tabular-nums">
                    {entry.grade === null ? s.ungraded : s.graded(entry.grade)}
                  </span>
                  {entry.engaged_seconds !== null ? (
                    <span className="tabular-nums">
                      {s.engaged(Math.round(entry.engaged_seconds / 60))}
                    </span>
                  ) : null}
                  {entry.defended ? <span>{s.defended}</span> : null}
                  {entry.solution_unfolded ? <span>{s.unfolded}</span> : null}
                </div>
                <div className="flex flex-wrap gap-4">
                  <Link
                    href={`/course/${entry.case_study_id}/solution/${entry.variant_id}`}
                    className="text-sm text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {s.readSolution}
                  </Link>
                  {entry.status === "processed" ? (
                    <Link
                      href={`/course/${entry.case_study_id}/defence/${entry.submission_id}`}
                      className="text-sm text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {s.talkItThrough}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}

        {history.next_cursor != null ? (
          <div>
            <Link
              href={`/course/history?cursor=${history.next_cursor}`}
              className="text-sm text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {s.more}
            </Link>
          </div>
        ) : null}
      </div>
    </StudentShell>
  );
}
