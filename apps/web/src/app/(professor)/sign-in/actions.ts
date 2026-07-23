"use server";

// Sign-in runs as a server action for the same reason redemption does: success
// must set an httpOnly session cookie the browser can never read (decision
// 0012). Sign-out is its counterpart, clearing that cookie server-side.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { professorLogin } from "@/lib/api/auth";
import { PRO_COOKIE, proCookieOptions } from "@/lib/api/session";

export async function signIn(
  email: string,
  password: string,
): Promise<{ ok: boolean }> {
  const result = await professorLogin(email, password);
  if (!result.ok) return { ok: false };
  const jar = await cookies();
  jar.set(PRO_COOKIE, result.auth.token, proCookieOptions());
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(PRO_COOKIE);
  redirect("/sign-in");
}
