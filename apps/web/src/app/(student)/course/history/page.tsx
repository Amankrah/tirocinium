import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getHistory } from "@/lib/api/unfold";
import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../../student-shell";
import { strings } from "../../strings";

// The seat's own record (guide 4.2b, milestone 8.4): effort made legible to the
// person who did it. A Server Component, so this route ships no client
// JavaScript; paging is a link with a cursor rather than an infinite scroll,
// which the guide rules out along with streaks and leaderboards. Nothing here
// ranks or compares: it is one seat's own work, newest first. No tally either:
// the record carries no totals, and counting activity is what guide 4.2b keeps
// off the student surface.
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
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6">
        <PageHeader
          back={{ href: "/course", label: strings.problem.backToCourse }}
          title={s.heading}
          size="lg"
        />

        {history.entries.length === 0 ? (
          <EmptyState icon="history" body={s.empty} />
        ) : (
          <ol className="flex flex-col gap-3">
            {history.entries.map((entry) => (
              <Card
                key={entry.submission_id}
                as="li"
                tone="flat"
                className="flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <span className="font-display text-xl leading-snug">{entry.case_study_title}</span>
                  <time
                    dateTime={new Date(entry.submitted_at * 1000).toISOString()}
                    className="font-mono text-sm tabular-nums text-ink-muted"
                  >
                    {s.submitted(formatDate(entry.submitted_at))}
                  </time>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                  <span className="font-mono tabular-nums">
                    {entry.grade === null ? s.ungraded : s.graded(entry.grade)}
                  </span>
                  {entry.engaged_seconds !== null ? (
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <Icon name="clock" size={12} />
                      {s.engaged(Math.round(entry.engaged_seconds / 60))}
                    </span>
                  ) : null}
                  {entry.defended ? (
                    <Badge tone="neutral">
                      <Icon name="mic" size={12} />
                      {s.defended}
                    </Badge>
                  ) : null}
                  {entry.solution_unfolded ? (
                    <Badge tone="neutral">
                      <Icon name="book" size={12} />
                      {s.unfolded}
                    </Badge>
                  ) : null}
                </div>
                <div className="-ml-3 flex flex-wrap gap-1">
                  <ButtonLink
                    href={`/course/${entry.case_study_id}/solution/${entry.variant_id}`}
                    variant="quiet"
                    size="sm"
                  >
                    <Icon name="book" size={14} className="text-ink-muted" />
                    {s.readSolution}
                  </ButtonLink>
                  {entry.status === "processed" ? (
                    <ButtonLink
                      href={`/course/${entry.case_study_id}/defence/${entry.submission_id}`}
                      variant="quiet"
                      size="sm"
                    >
                      <Icon name="mic" size={14} className="text-ink-muted" />
                      {s.talkItThrough}
                    </ButtonLink>
                  ) : null}
                </div>
              </Card>
            ))}
          </ol>
        )}

        {history.next_cursor != null ? (
          <div>
            <ButtonLink href={`/course/history?cursor=${history.next_cursor}`} variant="secondary">
              <Icon name="history" size={16} className="text-ink-muted" />
              {s.more}
            </ButtonLink>
          </div>
        ) : null}
      </main>
    </StudentShell>
  );
}
