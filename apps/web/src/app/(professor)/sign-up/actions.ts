"use server";

// Signup runs as a server action for the same reason sign-in does: success
// must set an httpOnly session cookie the browser can never read (decisions
// 0012 and 0065).
import { cookies } from "next/headers";

import { professorSignup, type SignupResult } from "@/lib/api/auth";
import { PRO_COOKIE, proCookieOptions } from "@/lib/api/session";

export async function signUp(
  email: string,
  password: string,
): Promise<SignupResult> {
  const result = await professorSignup(email, password);
  if (!result.ok) return result;
  const jar = await cookies();
  jar.set(PRO_COOKIE, result.auth.token, proCookieOptions());
  return result;
}
