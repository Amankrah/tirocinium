import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { listCaseStudies } from "@/lib/api/case-studies";
import { getCourse } from "@/lib/api/courses";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../professor-shell";
import { signOut } from "../../sign-in/actions";
import { strings } from "../../strings";
import { createCaseStudyAction, setPublishedAction } from "./actions";

// One course's authoring surface: its case studies with status, the publish
// toggle, and the form that writes a new draft. A Server Component; the backend
// returns drafts to the owner, so a professor sees everything they wrote. The
// course rail in the shell carries the other sections (decision 0102), so the
// page itself is the list and the form. Each case study stays a list item
// with its publish control inside it, which is how the authoring journey finds
// the row it just created.
function formatDate(at: number): string {
  return new Date(at * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { token, email } = await requireProfessor();
  const { courseId } = await params;
  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const course = await getCourse(token, id);
  if (!course) notFound();
  const cases = await listCaseStudies(token, id);
  const s = strings.course;

  return (
    <ProfessorShell
      email={email}
      signOut={signOut}
      course={{ id, title: course.title, section: "overview" }}
    >
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader
          title={course.title}
          size="lg"
          actions={
            <ButtonLink href={`/courses/${id}/import`} variant="secondary">
              <Icon name="file-import" size={16} />
              {s.importLink}
            </ButtonLink>
          }
        />

        <section aria-labelledby="case-studies-heading" className="flex flex-col gap-4">
          <SectionHeading id="case-studies-heading" title={s.heading} count={cases.length} />
          {cases.length === 0 ? (
            <EmptyState icon="layers" body={s.empty} />
          ) : (
            <ul className="flex flex-col gap-3">
              {cases.map((cs) => {
                const published = cs.status === "published";
                return (
                  <Card
                    key={cs.id}
                    as="li"
                    tone="flat"
                    padded={false}
                    className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 transition-colors duration-(--motion-duration) ease-(--motion-ease) hover:border-ink"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <Link
                        href={`/courses/${id}/case-studies/${cs.id}`}
                        className="rounded-sm font-display text-lg leading-snug focus-ring"
                      >
                        {cs.title}
                      </Link>
                      <span className="flex flex-wrap items-center gap-x-3 text-sm text-ink-muted">
                        <span className="font-mono text-xs tabular-nums">
                          {s.updated(formatDate(cs.updated_at))}
                        </span>
                        <span>{s.conceptCount(cs.concepts.length)}</span>
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge tone={published ? "green" : "neutral"}>
                        {published ? s.published : s.draft}
                      </Badge>
                      <form action={setPublishedAction.bind(null, id, cs.id, !published)}>
                        <Button variant="secondary" size="sm" type="submit">
                          {published ? s.unpublish : s.publish}
                        </Button>
                      </form>
                    </div>
                  </Card>
                );
              })}
            </ul>
          )}
        </section>

        <Card as="section" tone="flat" aria-labelledby="new-case-study-heading">
          <form action={createCaseStudyAction.bind(null, id)} className="flex flex-col gap-5">
            <SectionHeading id="new-case-study-heading" title={s.newHeading} rule={false} />
            <Field label={s.newTitleLabel}>
              <Input name="title" required />
            </Field>
            <Field label={s.newBodyLabel}>
              <Textarea name="body" required rows={10} className="font-mono text-sm" />
            </Field>
            <div>
              <Button type="submit">{s.newAction}</Button>
            </div>
          </form>
        </Card>
      </main>
    </ProfessorShell>
  );
}
