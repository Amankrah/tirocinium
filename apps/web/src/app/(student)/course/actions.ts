"use server";

// Dismissing the how-it-works panel runs as a server action for the same
// reason redemption does: the seat token lives in an httpOnly cookie and never
// reaches client JavaScript (decision 0011), so only the server can carry it.
import { revalidatePath } from "next/cache";

import { markSeatOnboarded } from "@/lib/api/seats";
import { requireSeat } from "@/lib/seat-session";

export async function dismissOnboarding(): Promise<void> {
  const { token } = await requireSeat();
  await markSeatOnboarded(token);
  // Course home reads `onboarded` from the seat, so the page it is rendered
  // on has to be re-read for the panel to stay gone on the next navigation.
  revalidatePath("/course");
}
