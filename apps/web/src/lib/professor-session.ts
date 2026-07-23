import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { fetchProfessor } from "./api/auth";
import { PRO_COOKIE } from "./api/session";

// Every professor surface needs the same thing: the JWT from the httpOnly
// cookie and the resolved identity (decision 0012). A missing, lapsed, or
// non-professor session goes to sign-in. Server-only; the token never reaches
// the client.
export async function requireProfessor() {
  const token = (await cookies()).get(PRO_COOKIE)?.value;
  if (!token) redirect("/sign-in");
  const professor = await fetchProfessor(token);
  if (!professor?.email) redirect("/sign-in");
  // The guard above narrows email to a string for callers.
  return { token, email: professor.email, professor };
}
