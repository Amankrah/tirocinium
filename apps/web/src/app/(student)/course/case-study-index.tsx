import Link from "next/link";

import { Button, ButtonLink } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../strings";
import { indexHref, type IndexView } from "./index-view";

// Course home as a scannable index (guide 4.1, decision 0083). Topics are the
// way a student looks a problem up, so the list is grouped under the concept a
// problem is chiefly about, and a topic can be opened on its own. Paging is a
// link, never an infinite scroll (guide 4.2b). Presentational: the page fetches
// the whole published set and passes the view.
const s = strings.course;

export function CaseStudyIndex({ view }: { view: IndexView }) {
  if (view.emptyCourse) {
    return <p className="text-ink/70">{s.empty}</p>;
  }

  const summary =
    view.topicName !== null
      ? s.countInTopic(view.total, view.topicName)
      : view.total === view.catalogue
        ? s.count(view.total)
        : s.countOf(view.total, view.catalogue);

  return (
    <section className="flex flex-col gap-6" aria-labelledby="problems-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="problems-heading" className="font-display text-2xl">
          {s.heading}
        </h2>
        <p className="flex flex-wrap gap-x-3 text-sm tabular-nums text-ink-muted">
          <span>{summary}</span>
          {view.pageCount > 1 ? <span>{s.pageStatus(view.page, view.pageCount)}</span> : null}
        </p>
      </div>

      <form method="get" action="/course" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {view.topicId !== null ? (
          <input type="hidden" name="topic" value={view.topicId} />
        ) : null}
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm text-ink">{s.searchLabel}</span>
          <input
            type="search"
            name="q"
            defaultValue={view.q}
            placeholder={s.searchPlaceholder}
            enterKeyHint="search"
            className="rounded-md border border-field-border bg-paper px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="quiet">
            {s.searchAction}
          </Button>
          {view.q ? (
            <Link
              href={indexHref({ topic: view.topicId })}
              className="text-sm text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {s.clearSearch}
            </Link>
          ) : null}
        </div>
      </form>

      {view.topics.length > 1 ? (
        <nav aria-label={s.topicsLabel}>
          <ul className="flex flex-wrap gap-2">
            <li>
              <TopicChip
                href={indexHref({ q: view.q })}
                current={view.topicId === null}
                label={s.allTopics}
                count={view.searchedCount}
              />
            </li>
            {view.topics.map((topic) => (
              <li key={topic.conceptId}>
                <TopicChip
                  href={indexHref({ topic: topic.conceptId, q: view.q })}
                  current={view.topicId === topic.conceptId}
                  label={topic.name}
                  count={topic.count}
                />
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {view.total === 0 ? (
        <p className="text-ink-muted">{s.noMatches}</p>
      ) : (
        <div className="flex flex-col gap-12">
          {view.groups.map((group) => {
            const heading = headingFor(group, view);
            const count = view.topics.find((topic) => topic.conceptId === group.conceptId)?.count;
            return (
              <section key={group.conceptId ?? "untagged"} className="flex flex-col gap-3">
                {heading ? (
                  <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-2">
                    <h3 className="font-display text-2xl">{heading}</h3>
                    {count != null ? (
                      <span className="text-sm tabular-nums text-ink-muted">{count}</span>
                    ) : null}
                  </div>
                ) : null}
                <ul className="flex flex-col gap-2">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <ProblemLink item={item} headingId={group.conceptId} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {view.pageCount > 1 ? (
        <nav
          aria-label={s.pagination}
          className="flex flex-wrap items-center justify-between gap-4 border-t border-rule-line pt-4"
        >
          <p className="flex flex-wrap gap-x-3 text-sm tabular-nums text-ink-muted">
            <span>{s.range(view.from, view.to, view.total)}</span>
            <span>{s.pageStatus(view.page, view.pageCount)}</span>
          </p>
          <div className="flex items-center gap-2">
            {view.page > 1 ? (
              <ButtonLink
                href={indexHref({ page: view.page - 1, topic: view.topicId, q: view.q })}
                variant="quiet"
                className="text-sm"
              >
                {s.previous}
              </ButtonLink>
            ) : (
              <span className="px-4 py-2 text-sm text-ink-muted" aria-disabled="true">
                {s.previous}
              </span>
            )}
            {view.page < view.pageCount ? (
              <ButtonLink
                href={indexHref({ page: view.page + 1, topic: view.topicId, q: view.q })}
                variant="quiet"
                className="text-sm"
              >
                {s.next}
              </ButtonLink>
            ) : (
              <span className="px-4 py-2 text-sm text-ink-muted" aria-disabled="true">
                {s.next}
              </span>
            )}
          </div>
        </nav>
      ) : null}
    </section>
  );
}

function headingFor(group: IndexView["groups"][number], view: IndexView): string | null {
  if (group.name) return group.name;
  // A filtered topic already names itself in the count line. An untagged
  // problem on a course that has topics needs its own heading, or it reads as
  // part of the topic above it.
  if (group.conceptId === null && view.topics.length > 0) return s.noTopic;
  return null;
}

function TopicChip({
  href,
  current,
  label,
  count,
}: {
  href: string;
  current: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "true" : undefined}
      className={
        current
          ? "inline-flex items-center gap-2 rounded-full border border-ink bg-ink px-3 py-1 text-sm text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          : "inline-flex items-center gap-2 rounded-full border border-field-border px-3 py-1 text-sm text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      }
    >
      <span>{label}</span>
      <span className="tabular-nums">{count}</span>
    </Link>
  );
}

function ProblemLink({
  item,
  headingId,
}: {
  item: Schemas["CaseStudySummary"];
  headingId: number | null;
}) {
  const also = item.concepts
    .filter((concept) => concept.concept_id !== headingId)
    .map((concept) => concept.name);
  return (
    <Link
      href={`/course/${item.id}`}
      className="group flex items-center justify-between gap-4 rounded-md border border-field-border bg-paper px-4 py-3.5 transition-colors duration-(--motion-duration) ease-(--motion-ease) hover:border-ink hover:bg-rule-line/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-display text-lg leading-snug group-hover:text-accent-text">
          {item.title}
        </span>
        {also.length > 0 ? (
          <span className="text-xs text-ink-muted">{s.also(also.join(", "))}</span>
        ) : null}
      </span>
      <span aria-hidden="true" className="shrink-0 font-display text-lg text-accent-text">
        →
      </span>
    </Link>
  );
}
