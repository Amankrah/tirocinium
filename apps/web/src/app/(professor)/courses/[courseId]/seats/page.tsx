import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getCourse } from "@/lib/api/courses";
import { listSeats } from "@/lib/api/seats";
import { requireProfessor } from "@/lib/professor-session";
import { ProfessorShell } from "../../../professor-shell";
import { signOut } from "../../../sign-in/actions";
import { strings } from "../../../strings";
import {
  generateSeatsAction,
  reissueSeatAction,
  revokeSeatAction,
} from "./actions";
import { GenerateSeats } from "./generate-seats";
import { ReissueSeat } from "./reissue-seat";

// The professor's seat surface for one course: mint a batch (its codes live only
// in the download files), see every seat with its status and use, and revoke or
// reissue individually. A Server Component; the backend enforces ownership, so a
// professor only ever sees their own seats.
export default async function SeatsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { token, email } = await requireProfessor();
  const { courseId } = await params;
  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const course = await getCourse(token, id);
  if (!course) notFound();
  const seats = await listSeats(token, id);
  const s = strings.seats;

  return (
    <ProfessorShell email={email} signOut={signOut}>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-2">
          <Link
            href={`/courses/${id}`}
            className="text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {s.back}
          </Link>
          <h1 className="font-display text-4xl">{course.title}</h1>
          <h2 className="font-display text-2xl">{s.heading}</h2>
        </div>

        <p className="max-w-prose text-sm text-ink/70">{s.note}</p>

        <GenerateSeats action={generateSeatsAction.bind(null, id)} />

        {seats.length === 0 ? (
          <p className="text-ink/70">{s.empty}</p>
        ) : (
          <table className="w-full border-t border-rule-line text-left text-sm">
            <thead>
              <tr className="text-ink-muted">
                <th scope="col" className="py-3 font-medium">
                  {s.colSeat}
                </th>
                <th scope="col" className="py-3 font-medium">
                  {s.colStatus}
                </th>
                <th scope="col" className="py-3 font-medium">
                  {s.colLastUsed}
                </th>
                <th scope="col" className="py-3 text-right font-medium tabular-nums">
                  {s.colSubmissions}
                </th>
                <th scope="col" className="py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-rule-line">
              {seats.map((seat) => {
                const active = seat.status === "active";
                return (
                  <tr key={seat.id} className="align-top">
                    <td className="py-3 font-mono">{seat.seat_number}</td>
                    <td className="py-3">
                      <span
                        className={active ? "text-verify-green" : "text-ink-muted"}
                      >
                        {active ? s.active : s.revoked}
                      </span>
                    </td>
                    <td className="py-3 text-ink/70">
                      {seat.last_used_at === null
                        ? s.neverUsed
                        : new Date(seat.last_used_at * 1000)
                            .toISOString()
                            .slice(0, 10)}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      {seat.submission_count}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-col items-end gap-2">
                        {active ? (
                          <form action={revokeSeatAction.bind(null, id, seat.id)}>
                            <Button
                              variant="quiet"
                              type="submit"
                              className="text-sm"
                            >
                              {s.revoke}
                            </Button>
                          </form>
                        ) : null}
                        <ReissueSeat
                          seatNumber={seat.seat_number}
                          action={reissueSeatAction.bind(null, id, seat.id)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </ProfessorShell>
  );
}
