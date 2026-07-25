// The practice loop's variant read (Phase 5.4). A course reader (a seat sees
// published only) asks for a servable variant; the backend serves instantly from
// the pre-generated pool and never generates on this path, so there is no
// generation spinner anywhere in the loop. A null variant_id means the pool has
// nothing servable yet and the body is the base case study, which reads
// identically. Solutions never appear here. Server-side only, carrying the seat
// token (decision 0011).
import { apiBaseUrl, type Schemas } from "./client";

export async function getPracticeVariant(
  token: string,
  courseId: number,
  caseStudyId: number,
  exclude?: number | null,
): Promise<Schemas["PracticeVariantOut"] | null> {
  const query = exclude != null ? `?exclude=${exclude}` : "";
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/api/v1/courses/${courseId}/case-studies/${caseStudyId}/practice-variant${query}`,
      {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["PracticeVariantOut"];
}
