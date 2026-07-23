import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { fetchProfessor } from "@/lib/api/auth";
import { PRO_COOKIE } from "@/lib/api/session";
import { signOut } from "../sign-in/actions";
import { ProfessorShell } from "../professor-shell";
import { strings } from "../strings";

// The authenticated professor landing. A Server Component that reads the session
// cookie and resolves the identity directly (guide 2, decision 0012); a missing
// or lapsed session, or a non-professor role, sends them to sign-in. The course
// list is Phase 2.1/2.3 work; today this proves the session end to end.
export default async function DashboardPage() {
  const token = (await cookies()).get(PRO_COOKIE)?.value;
  if (!token) redirect("/sign-in");
  const identity = await fetchProfessor(token);
  if (!identity?.email) redirect("/sign-in");

  return (
    <ProfessorShell email={identity.email} signOut={signOut}>
      <main className="mx-auto flex min-h-[60svh] w-full max-w-[var(--measure-reading)] flex-col justify-center gap-4 px-6">
        <h1 className="font-display text-3xl">
          {strings.dashboard.greeting(identity.email)}
        </h1>
        <p className="text-ink/70">{strings.dashboard.empty}</p>
      </main>
    </ProfessorShell>
  );
}
