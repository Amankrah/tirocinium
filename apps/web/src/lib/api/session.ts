// The seat session cookie (decision 0011): the opaque course-scoped token from
// redemption, httpOnly so client JavaScript can never read it. One module owns
// the name and options so the server action that sets it and the Server
// Components that read it can never drift apart.
export const SEAT_COOKIE = "seat_session";

// About a year: guide 4.0 says the session persists long-term on the device,
// and the reusable code is the only recovery path, so there is nothing to
// expire early.
const SEAT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function seatCookieOptions() {
  return sessionCookieOptions(SEAT_COOKIE_MAX_AGE);
}

// The professor session cookie (decision 0012): the same httpOnly treatment as
// the seat token, but its life matches the 8 h JWT it carries (decision 0009),
// because a professor account is a credential that should lapse, unlike a
// pseudonymous seat.
export const PRO_COOKIE = "pro_session";

const PRO_COOKIE_MAX_AGE = 60 * 60 * 8;

export function proCookieOptions() {
  return sessionCookieOptions(PRO_COOKIE_MAX_AGE);
}

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Localhost dev is plain http; production is always https.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
