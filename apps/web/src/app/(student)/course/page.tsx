import Link from "next/link";

import { ParticleHero } from "@/components/particles/hero";
import { listAllCaseStudies } from "@/lib/api/case-studies";
import { getMastery, getRevisit } from "@/lib/api/mastery";
import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../student-shell";
import { strings } from "../strings";
import { CaseStudyIndex } from "./case-study-index";
import { buildIndexView } from "./index-view";
import { MasteryPicture } from "./mastery-picture";
import { OnboardingPanel } from "./onboarding-panel";
import { RevisitQueue } from "./revisit-queue";

// Course home (guide 4.1, 4.2b, decision 0083): the seat is greeted by number,
// then the calm revisit prompt (if any), the published problems grouped and
// paged, and the mastery picture, every label expandable to its evidence. The
// list endpoint pages, so this walk follows the cursor to the end before the
// index slices a page: a seat can reach every problem assigned to the course.
// A Server Component that resolves the seat and its course directly from the
// httpOnly session (decision 0011). Topic, search, and page live in the URL.
export default async function CourseHomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; topic?: string; q?: string }>;
}) {
  const { token, seat } = await requireSeat();
  const params = await searchParams;
  const [items, mastery, revisit] = await Promise.all([
    listAllCaseStudies(token, seat.course_id),
    getMastery(token, seat.course_id),
    getRevisit(token, seat.course_id),
  ]);
  const view = buildIndexView(items, params);

  return (
    <StudentShell seatNumber={seat.seat_number}>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        {/* The field's second and last home (guide 3.3: the landing and course
            home hero, and nowhere else). On this page the greeting is one
            line, so the field sits beside it rather than across the letters.
            The index and the mastery picture below stay plain. */}
        <ParticleHero align="end">
          <h1 className="font-display text-3xl">
            {strings.course.greeting(seat.seat_number, seat.course_title)}
          </h1>
        </ParticleHero>
        {seat.onboarded ? null : <OnboardingPanel />}
        {revisit ? <RevisitQueue revisit={revisit} /> : null}
        <CaseStudyIndex view={view} />
        {mastery ? <MasteryPicture mastery={mastery} /> : null}
        {/* Two quiet links rather than nagging cards (guide 4.2b: calm is
            the feature). How practice works stays reachable long after the
            first-run panel is gone, because the week someone wonders how the
            defence fits is rarely the week they arrived. */}
        <div className="flex flex-wrap gap-4 self-start">
          <Link
            href="/course/how-it-works"
            className="text-sm text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {strings.onboarding.pageLink}
          </Link>
          <Link
            href="/course/history"
            className="text-sm text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {strings.history.link}
          </Link>
        </div>
      </main>
    </StudentShell>
  );
}
