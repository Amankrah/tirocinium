import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
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
    <ProfessorShell
      email={email}
      signOut={signOut}
      course={{ id: cid, title: course.title, section: "reports" }}
    >
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader title={s.heading} />

        {activity ? <ActivityReport activity={activity} /> : null}
        {usage ? <UsageReport usage={usage} /> : null}
        {health ? <HealthReport health={health} /> : null}
        {agreement ? <AgreementReport agreement={agreement} /> : null}
      </main>
    </ProfessorShell>
  );
}
