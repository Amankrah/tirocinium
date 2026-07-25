// The mastery picture, the revisit queue, and the professor's distribution
// (Phase 6). The student surfaces take the seat token (a professor gets 403);
// the distribution is professor-and-owner. Server-side only (decisions 0011,
// 0012); shapes from the generated client (frontend guide 7). The transparency
// contract is satisfied server-side: every label ships with its evidence trail,
// so the only frontend rule is never to render a label without its expansion.
import { apiBaseUrl, type Schemas } from "./client";

export async function getMastery(
  token: string,
  courseId: number,
): Promise<Schemas["MasteryOut"] | null> {
  return read(token, `courses/${courseId}/mastery`);
}

export async function getRevisit(
  token: string,
  courseId: number,
): Promise<Schemas["RevisitOut"] | null> {
  return read(token, `courses/${courseId}/revisit`);
}

export async function getDistribution(
  token: string,
  courseId: number,
): Promise<Schemas["DistributionOut"] | null> {
  return read(token, `courses/${courseId}/mastery/distribution`);
}

async function read<T>(token: string, path: string): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as T;
}
