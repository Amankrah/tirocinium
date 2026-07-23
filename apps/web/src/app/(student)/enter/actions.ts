"use server";

// Redemption runs as a server action, not a client TanStack Query mutation
// (guide 2's default), for one reason: success must set an httpOnly seat cookie
// the browser can never read (decision 0011), and only the server can do that.
// The reads it unlocks stay ordinary Server Component fetches.
import { cookies } from "next/headers";

import { redeemSeatCode } from "@/lib/api/seats";
import { SEAT_COOKIE, seatCookieOptions } from "@/lib/api/session";

export async function enterCourse(code: string): Promise<{ ok: boolean }> {
  const result = await redeemSeatCode(code);
  if (!result.ok) return { ok: false };
  const jar = await cookies();
  jar.set(SEAT_COOKIE, result.session.token, seatCookieOptions());
  return { ok: true };
}
