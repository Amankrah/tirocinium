import { strings } from "../strings";
import { SeatCodeForm } from "./seat-code-form";

// Guide 4.0: one screen, the code field, a single action, nothing else. It
// should feel like unlocking something rather than logging in.
export default function EnterCoursePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 px-6">
      <h1 className="font-display text-3xl">{strings.enter.title}</h1>
      <SeatCodeForm />
    </main>
  );
}
