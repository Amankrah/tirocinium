import { ParticleHero } from "@/components/particles/hero";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
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

// Course home (guide 4.1, 4.2b, decision 0083; restyled in 0102): the seat is
// greeted by number, then the calm revisit prompt (if any), the published
// problems grouped and paged, and the mastery picture, every label expandable
// to its evidence. The list endpoint pages, so this walk follows the cursor to
// the end before the index slices a page: a seat can reach every problem
// assigned to the course. A Server Component that resolves the seat and its
// course directly from the httpOnly session (decision 0011). Topic, search,
// and page live in the URL.
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
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-10 sm:px-6">
        {/* The field's second and last home (guide 3.3: the landing and course
            home hero, and nowhere else). On this page the greeting is one
            line, so the field sits beside it rather than across the letters.
            The index and the mastery picture below stay plain. */}
        <ParticleHero align="end">
          <header className="flex flex-col gap-2">
            <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">
              {strings.course.greeting(seat.seat_number, seat.course_title)}
            </h1>
          </header>
        </ParticleHero>
        {seat.onboarded ? null : <OnboardingPanel />}
        {revisit ? <RevisitQueue revisit={revisit} /> : null}
        <CaseStudyIndex view={view} />
        {mastery ? <MasteryPicture mastery={mastery} /> : null}
        {/* Two quiet links rather than nagging cards (guide 4.2b: calm is
            the feature). How practice works stays reachable long after the
            first-run panel is gone, because the week someone wonders how the
            defence fits is rarely the week they arrived. */}
        <div className="flex flex-wrap gap-2 border-t border-rule-line pt-6">
          <ButtonLink href="/course/how-it-works" variant="quiet" size="sm">
            <Icon name="help" size={14} className="text-ink-muted" />
            {strings.onboarding.pageLink}
          </ButtonLink>
          <ButtonLink href="/course/history" variant="quiet" size="sm">
            <Icon name="history" size={14} className="text-ink-muted" />
            {strings.history.link}
          </ButtonLink>
        </div>
      </main>
    </StudentShell>
  );
}
