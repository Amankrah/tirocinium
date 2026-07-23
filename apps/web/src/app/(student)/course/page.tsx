import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { fetchSeatMe } from "@/lib/api/seats";
import { SEAT_COOKIE } from "@/lib/api/session";
import { StudentShell } from "../student-shell";
import { strings } from "../strings";

// The authenticated student landing. A Server Component that reads the seat
// session cookie and fetches the seat's own identity directly (guide 2), which
// is exactly why the token lives in a server-readable httpOnly cookie
// (decision 0011). Any missing or no-longer-valid session sends the student
// back to /enter, where the reusable code is the only recovery path (guide 4.0).
// The case study index is Phase 2.3; today this proves the session end to end.
export default async function CourseHomePage() {
  const token = (await cookies()).get(SEAT_COOKIE)?.value;
  if (!token) redirect("/enter");
  const seat = await fetchSeatMe(token);
  if (!seat) redirect("/enter");

  return (
    <StudentShell seatNumber={seat.seat_number}>
      <main className="mx-auto flex min-h-[60svh] w-full max-w-[var(--measure-reading)] flex-col justify-center gap-4 px-6">
        <h1 className="font-display text-3xl">
          {strings.course.greeting(seat.seat_number, seat.course_title)}
        </h1>
        <p className="text-ink/70">{strings.course.empty}</p>
      </main>
    </StudentShell>
  );
}
