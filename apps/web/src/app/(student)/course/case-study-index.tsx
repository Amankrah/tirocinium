import Link from "next/link";

import { Button, ButtonLink, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../strings";
import { indexHref, type IndexView } from "./index-view";

// Course home as a scannable index (guide 4.1, decision 0083). Topics are the
// way a student looks a problem up, so the list is grouped under the concept a
// problem is chiefly about, and a topic can be opened on its own. Paging is a
// link, never an infinite scroll (guide 4.2b). Presentational: the page fetches
// the whole published set and passes the view. Each problem is a flat card row
// (decision 0102): title in the display face, the other concepts it carries as
// a quiet meta line, and a chevron, with the row itself the link.
const s = strings.course;

export function CaseStudyIndex({ view }: { view: IndexView }) {
  if (view.emptyCourse) {
    return <EmptyState icon="book" body={s.empty} />;
  }

  const summary =
    view.topicName !== null
      ? s.countInTopic(view.total, view.topicName)
      : view.total === view.catalogue
        ? s.count(view.total)
        : s.countOf(view.total, view.catalogue);

  return (
    <section className="flex flex-col gap-6" aria-labelledby="problems-heading">
      <SectionHeading
        id="problems-heading"
        title={s.heading}
        count={
          <>
            <span>{summary}</span>
            {view.pageCount > 1 ? (
              <span className="ml-3">{s.pageStatus(view.page, view.pageCount)}</span>
            ) : null}
          </>
        }
      />

      <form method="get" action="/course" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {view.topicId !== null ? (
          <input type="hidden" name="topic" value={view.topicId} />
        ) : null}
        <Field label={s.searchLabel} className="min-w-0 flex-1">
          <span className="relative block">
            <Icon
              name="search"
              size={16}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted"
            />
            <Input
              type="search"
              name="q"
              defaultValue={view.q}
              placeholder={s.searchPlaceholder}
              enterKeyHint="search"
              className="pl-10"
            />
          </span>
        </Field>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="secondary">
            {s.searchAction}
          </Button>
          {view.q ? (
            <ButtonLink href={indexHref({ topic: view.topicId })} variant="quiet">
              <Icon name="x" size={14} className="text-ink-muted" />
              {s.clearSearch}
            </ButtonLink>
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
        <EmptyState icon="search" body={s.noMatches} />
      ) : (
        <div className="flex flex-col gap-10">
          {view.groups.map((group) => {
            const heading = headingFor(group, view);
            const count = view.topics.find((topic) => topic.conceptId === group.conceptId)?.count;
            return (
              <section key={group.conceptId ?? "untagged"} className="flex flex-col gap-3">
                {heading ? (
                  <SectionHeading level={3} title={heading} count={count ?? undefined} />
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
                variant="secondary"
                size="sm"
              >
                <Icon name="arrow-left" size={14} className="text-ink-muted" />
                {s.previous}
              </ButtonLink>
            ) : (
              <span
                className={buttonClassName("secondary", "pointer-events-none opacity-50", "sm")}
                aria-disabled="true"
              >
                <Icon name="arrow-left" size={14} className="text-ink-muted" />
                {s.previous}
              </span>
            )}
            {view.page < view.pageCount ? (
              <ButtonLink
                href={indexHref({ page: view.page + 1, topic: view.topicId, q: view.q })}
                variant="secondary"
                size="sm"
              >
                {s.next}
                <Icon name="arrow-right" size={14} className="text-ink-muted" />
              </ButtonLink>
            ) : (
              <span
                className={buttonClassName("secondary", "pointer-events-none opacity-50", "sm")}
                aria-disabled="true"
              >
                {s.next}
                <Icon name="arrow-right" size={14} className="text-ink-muted" />
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

// A topic chip is a link with the choice in the URL. Hand-rolled rather than
// the segmented nav because the index test pins aria-current="true" on the
// open topic, and because topics wrap into rows rather than sit in one track.
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
        "inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-sm " +
        "transition-colors duration-(--motion-duration) ease-(--motion-ease) focus-ring " +
        (current
          ? "border-ink bg-ink font-medium text-paper"
          : "border-rule-line bg-surface text-ink hover:border-ink")
      }
    >
      <span>{label}</span>
      <span className={"tabular-nums text-xs " + (current ? "text-paper/70" : "text-ink-muted")}>
        {count}
      </span>
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
      className="group flex items-center justify-between gap-4 rounded-lg border border-rule-line bg-surface px-4 py-3.5 transition-colors duration-(--motion-duration) ease-(--motion-ease) hover:border-ink hover:bg-surface-sunken/40 focus-ring"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-display text-lg leading-snug">{item.title}</span>
        {also.length > 0 ? (
          <span className="text-sm text-ink-muted">{s.also(also.join(", "))}</span>
        ) : null}
      </span>
      <Icon
        name="chevron-right"
        size={16}
        className="text-ink-muted transition-colors duration-(--motion-duration) ease-(--motion-ease) group-hover:text-ink"
      />
    </Link>
  );
}
