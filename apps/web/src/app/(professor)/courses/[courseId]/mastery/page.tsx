import Link from "next/link";
import { notFound } from "next/navigation";

import { getCourse } from "@/lib/api/courses";
import { getDistribution } from "@/lib/api/mastery";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../../professor-shell";
import { signOut } from "../../../sign-in/actions";
import { strings } from "../../../strings";
import { DistributionView } from "./distribution-view";

// The professor's class-progress view (guide 4.2b). A Server Component: it proves
// the professor owns the course and reads the per-concept distribution, which is
// anonymous counts by design (no per-seat identity in the shape).
export default async function MasteryPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { token, email } = await requireProfessor();
  const { courseId } = await params;
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) notFound();

  const course = await getCourse(token, cid);
  if (!course) notFound();
  const distribution = await getDistribution(token, cid);
  if (!distribution) notFound();

  return (
    <ProfessorShell email={email} signOut={signOut}>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-2">
          <Link
            href={`/courses/${cid}`}
            className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {strings.distribution.back}
          </Link>
          <h1 className="font-display text-4xl">{strings.distribution.title}</h1>
          <p className="max-w-prose text-sm text-ink-muted">
            {strings.distribution.intro}
          </p>
        </div>
        <DistributionView distribution={distribution} />
      </main>
    </ProfessorShell>
  );
}
