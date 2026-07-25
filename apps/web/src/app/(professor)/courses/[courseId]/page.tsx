import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { listCaseStudies } from "@/lib/api/case-studies";
import { getCourse } from "@/lib/api/courses";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../professor-shell";
import { signOut } from "../../sign-in/actions";
import { strings } from "../../strings";
import { createCaseStudyAction, setPublishedAction } from "./actions";

// One course's authoring surface: its case studies with status, the publish
// toggle, and the form that writes a new draft. A Server Component; the backend
// returns drafts to the owner, so a professor sees everything they wrote.
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

  return (
    <ProfessorShell email={email} signOut={signOut}>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-2">
          <Link
            href="/dashboard"
            className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {strings.course.back}
          </Link>
          <h1 className="font-display text-4xl">{course.title}</h1>
          <div className="flex flex-wrap gap-4">
            <Link
              href={`/courses/${id}/seats`}
              className="text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {strings.course.seatsLink}
            </Link>
            <Link
              href={`/courses/${id}/import`}
              className="text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {strings.course.importLink}
            </Link>
            <Link
              href={`/courses/${id}/mastery`}
              className="text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {strings.course.masteryLink}
            </Link>
          </div>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl">{strings.course.heading}</h2>
          {cases.length === 0 ? (
            <p className="text-ink/70">{strings.course.empty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-rule-line">
              {cases.map((cs) => {
                const published = cs.status === "published";
                return (
                  <li
                    key={cs.id}
                    className="flex items-center justify-between gap-4 py-4"
                  >
                    <div className="flex flex-col gap-1">
                      <Link
                        href={`/courses/${id}/case-studies/${cs.id}`}
                        className="font-display text-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {cs.title}
                      </Link>
                      <span
                        className={
                          published
                            ? "text-xs text-verify-green"
                            : "text-xs text-ink-muted"
                        }
                      >
                        {published
                          ? strings.course.published
                          : strings.course.draft}
                      </span>
                    </div>
                    <form action={setPublishedAction.bind(null, id, cs.id, !published)}>
                      <Button variant="quiet" type="submit" className="text-sm">
                        {published
                          ? strings.course.unpublish
                          : strings.course.publish}
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <form
          action={createCaseStudyAction.bind(null, id)}
          className="flex flex-col gap-3 border-t border-rule-line pt-6"
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm text-ink">{strings.course.newTitleLabel}</span>
            <input
              name="title"
              required
              className="rounded-md border border-rule-line bg-paper px-4 py-3 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-ink">{strings.course.newBodyLabel}</span>
            <textarea
              name="body"
              required
              rows={10}
              className="rounded-md border border-rule-line bg-paper px-4 py-3 font-mono text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          <div>
            <Button type="submit">{strings.course.newAction}</Button>
          </div>
        </form>
      </main>
    </ProfessorShell>
  );
}
