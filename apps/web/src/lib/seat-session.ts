import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { fetchSeatMe } from "./api/seats";
import { SEAT_COOKIE } from "./api/session";

// Every student surface needs the same thing: the seat token from the httpOnly
// cookie and the seat's own record (decision 0011). A missing or lapsed session
// sends them to /enter, where the reusable code is the one way back in (guide
// 4.0). Server-only; the token never crosses to the client.
export async function requireSeat() {
  const token = (await cookies()).get(SEAT_COOKIE)?.value;
  if (!token) redirect("/enter");
  const seat = await fetchSeatMe(token);
  if (!seat) redirect("/enter");
  return { token, seat };
}
