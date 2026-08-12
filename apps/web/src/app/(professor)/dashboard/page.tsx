import Link from "next/link";

import { Button } from "@/components/ui/button";
import { listCourses } from "@/lib/api/courses";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../professor-shell";
import { signOut } from "../sign-in/actions";
import { strings } from "../strings";
import { createCourseAction } from "./actions";

// The authenticated professor dashboard: their courses, and the one action that
// starts a new one. A Server Component resolving the session server-side
// (decision 0012); a lapsed session goes to sign-in.
export default async function DashboardPage() {
  const { token, email } = await requireProfessor();
  const courses = await listCourses(token);

  return (
    <ProfessorShell email={email} signOut={signOut}>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <h1 className="font-display text-3xl">{strings.dashboard.heading}</h1>

        {courses.length === 0 ? (
          <p className="text-ink/70">{strings.dashboard.empty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule-line">
            {courses.map((course) => (
              <li key={course.id}>
                <Link
                  href={`/courses/${course.id}`}
                  className="block py-4 font-display text-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {course.title}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <form
          action={createCourseAction}
          className="flex flex-col gap-3 border-t border-rule-line pt-6"
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm text-ink">
              {strings.dashboard.newCourseLabel}
            </span>
            <input
              name="title"
              required
              className="rounded-md border border-field-border bg-paper px-4 py-3 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          <div>
            <Button type="submit">{strings.dashboard.newCourseAction}</Button>
          </div>
        </form>
      </main>
    </ProfessorShell>
  );
}
