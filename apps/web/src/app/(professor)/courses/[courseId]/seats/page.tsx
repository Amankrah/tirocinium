import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, Tr } from "@/components/ui/table";
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

// The professor's seat surface for one course (guide 4.0b): mint a batch (its
// codes live only in the download files), see every seat with its status and
// use, and revoke or reissue individually. A Server Component; the backend
// enforces ownership, so a professor only ever sees their own seats. The
// roster is a table because it is roster-like data; the missing name column
// is the identity model, and the line under the table says so.
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
    <ProfessorShell
      email={email}
      signOut={signOut}
      course={{ id, title: course.title, section: "seats" }}
    >
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader title={s.heading} description={s.note} />

        <GenerateSeats action={generateSeatsAction.bind(null, id)} />

        {seats.length === 0 ? (
          <EmptyState icon="users" body={s.empty} />
        ) : (
          <section className="flex flex-col gap-3">
            <Table>
              <thead>
                <tr>
                  <Th>{s.colSeat}</Th>
                  <Th>{s.colStatus}</Th>
                  <Th>{s.colLastUsed}</Th>
                  <Th justify="end">{s.colSubmissions}</Th>
                  <Th justify="end" />
                </tr>
              </thead>
              <tbody>
                {seats.map((seat) => {
                  const active = seat.status === "active";
                  return (
                    <Tr key={seat.id}>
                      <Td numeric className="font-medium">
                        {seat.seat_number}
                      </Td>
                      <Td>
                        <Badge tone={active ? "green" : "amber"}>
                          {active ? s.active : s.revoked}
                        </Badge>
                      </Td>
                      <Td numeric className="text-ink-muted">
                        {seat.last_used_at === null
                          ? s.neverUsed
                          : new Date(seat.last_used_at * 1000).toISOString().slice(0, 10)}
                      </Td>
                      <Td numeric justify="end">
                        {seat.submission_count}
                      </Td>
                      <Td justify="end">
                        <div className="flex flex-wrap items-start justify-end gap-2">
                          {active ? (
                            <form action={revokeSeatAction.bind(null, id, seat.id)}>
                              <Button variant="danger" size="sm" type="submit">
                                {s.revoke}
                              </Button>
                            </form>
                          ) : null}
                          <ReissueSeat
                            seatNumber={seat.seat_number}
                            action={reissueSeatAction.bind(null, id, seat.id)}
                          />
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            <p className="max-w-prose text-sm text-ink-muted">{s.namesHint}</p>
          </section>
        )}
      </main>
    </ProfessorShell>
  );
}
