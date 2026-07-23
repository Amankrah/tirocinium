import { listCaseStudies } from "@/lib/api/case-studies";
import { requireSeat } from "@/lib/seat-session";
import { StudentShell } from "../student-shell";
import { strings } from "../strings";
import { CaseStudyIndex } from "./case-study-index";

// Course home (guide 4.1): the seat is greeted by number, then the published
// case studies as a clean index. A Server Component that resolves the seat and
// its course directly from the httpOnly session (decision 0011); the backend
// returns only published case studies to a seat.
export default async function CourseHomePage() {
  const { token, seat } = await requireSeat();
  const items = await listCaseStudies(token, seat.course_id);

  return (
    <StudentShell seatNumber={seat.seat_number}>
      <main className="mx-auto flex w-full max-w-[var(--measure-reading)] flex-col gap-8 px-6 py-12">
        <h1 className="font-display text-3xl">
          {strings.course.greeting(seat.seat_number, seat.course_title)}
        </h1>
        <CaseStudyIndex items={items} />
      </main>
    </StudentShell>
  );
}
