import { listCaseStudies } from "@/lib/api/case-studies";
import { getMastery, getRevisit } from "@/lib/api/mastery";
import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../student-shell";
import { strings } from "../strings";
import { CaseStudyIndex } from "./case-study-index";
import { MasteryPicture } from "./mastery-picture";
import { RevisitQueue } from "./revisit-queue";

// Course home (guide 4.1, 4.2b): the seat is greeted by number, then the calm
// revisit prompt (if any), the published case studies, and the mastery picture,
// every label expandable to its evidence. A Server Component that resolves the
// seat and its course directly from the httpOnly session (decision 0011).
export default async function CourseHomePage() {
  const { token, seat } = await requireSeat();
  const [items, mastery, revisit] = await Promise.all([
    listCaseStudies(token, seat.course_id),
    getMastery(token, seat.course_id),
    getRevisit(token, seat.course_id),
  ]);

  return (
    <StudentShell seatNumber={seat.seat_number}>
      <main className="mx-auto flex w-full max-w-[var(--measure-reading)] flex-col gap-8 px-6 py-12">
        <h1 className="font-display text-3xl">
          {strings.course.greeting(seat.seat_number, seat.course_title)}
        </h1>
        {revisit ? <RevisitQueue revisit={revisit} /> : null}
        <CaseStudyIndex items={items} />
        {mastery ? <MasteryPicture mastery={mastery} /> : null}
      </main>
    </StudentShell>
  );
}
