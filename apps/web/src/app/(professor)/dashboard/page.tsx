import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { listCourses } from "@/lib/api/courses";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../professor-shell";
import { signOut } from "../sign-in/actions";
import { strings } from "../strings";
import { createCourseAction } from "./actions";

// The authenticated professor dashboard: their courses, and the one action that
// starts a new one. A Server Component resolving the session server-side
// (decision 0012); a lapsed session goes to sign-in. Each course is an object
// a professor opens, so it sits on a raised sheet (decision 0102); the new
// course form stays flat beneath them.
function formatDate(at: number): string {
  return new Date(at * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function DashboardPage() {
  const { token, email } = await requireProfessor();
  const courses = await listCourses(token);
  const s = strings.dashboard;

  return (
    <ProfessorShell email={email} signOut={signOut}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader title={s.heading} />

        {courses.length === 0 ? (
          <EmptyState icon="book" body={s.empty} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <Card
                key={course.id}
                as="li"
                padded={false}
                className="transition-[border-color,box-shadow] duration-(--motion-duration) ease-(--motion-ease) hover:border-ink hover:shadow-floating"
              >
                <Link
                  href={`/courses/${course.id}`}
                  className="flex h-full flex-col gap-3 rounded-lg p-5 focus-ring sm:p-6"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-display text-xl leading-snug">{course.title}</span>
                    <Icon name="chevron-right" size={16} className="mt-1 text-ink-muted" />
                  </span>
                  <span className="text-sm text-ink-muted">
                    {s.created(formatDate(course.created_at))}
                  </span>
                </Link>
              </Card>
            ))}
          </ul>
        )}

        <Card as="section" tone="flat" aria-labelledby="new-course-heading">
          <form action={createCourseAction} className="flex flex-col gap-5">
            <SectionHeading id="new-course-heading" title={s.newCourseHeading} rule={false} />
            <Field label={s.newCourseLabel} className="max-w-md">
              <Input name="title" required />
            </Field>
            <div>
              <Button type="submit">{s.newCourseAction}</Button>
            </div>
          </form>
        </Card>
      </main>
    </ProfessorShell>
  );
}
