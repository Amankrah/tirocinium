import Link from "next/link";
import { notFound } from "next/navigation";

import { getCourse } from "@/lib/api/courses";
import {
  getActivity,
  getHealth,
  getRubricAgreement,
  getUsage,
} from "@/lib/api/reports";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../../professor-shell";
import { signOut } from "../../../sign-in/actions";
import { strings } from "../../../strings";
import {
  ActivityReport,
  AgreementReport,
  HealthReport,
  UsageReport,
} from "./report-views";

// Course reporting (guide 8, milestone 8.3). A Server Component start to
// finish: four dense reads with no interaction, so this route ships no client
// JavaScript at all. A report that fails to load is left out rather than
// failing the page, because three working reports beat one error.
export default async function ReportsPage({
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

  const [activity, usage, health, agreement] = await Promise.all([
    getActivity(token, cid),
    getUsage(token, cid),
    getHealth(token, cid),
    getRubricAgreement(token, cid),
  ]);

  const s = strings.reports;

  return (
    <ProfessorShell email={email} signOut={signOut}>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-6 py-12">
        <div className="flex flex-col gap-2">
          <Link
            href={`/courses/${cid}`}
            className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {s.back}
          </Link>
          <h1 className="font-display text-4xl">{s.heading}</h1>
          <p className="text-ink-muted">{course.title}</p>
        </div>

        {activity ? <ActivityReport activity={activity} /> : null}
        {usage ? <UsageReport usage={usage} /> : null}
        {health ? <HealthReport health={health} /> : null}
        {agreement ? <AgreementReport agreement={agreement} /> : null}
      </main>
    </ProfessorShell>
  );
}
