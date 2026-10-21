import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
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
    <ProfessorShell
      email={email}
      signOut={signOut}
      course={{ id: cid, title: course.title, section: "mastery" }}
    >
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader
          title={strings.distribution.title}
          description={strings.distribution.intro}
        />
        <DistributionView distribution={distribution} />
      </main>
    </ProfessorShell>
  );
}
