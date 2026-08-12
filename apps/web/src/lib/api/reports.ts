// Course reporting (milestone 8.3, decision 0048): four professor-and-owner
// reads that are lenses over rows the pipelines already write. Server-side,
// carrying the JWT (decision 0012); shapes from the generated client.
//
// Two properties of this data shape every surface built on it. Prices are
// configuration, so a course with none configured reports real usage with null
// costs and `priced: false`, and the surface must say "not priced" rather than
// draw a zero. And a statistic with an empty denominator is null, never zero, so
// null means "we cannot say" and must never render as a finding.
import { apiBaseUrl, type Schemas } from "./client";

const base = (courseId: number) =>
  `${apiBaseUrl()}/api/v1/courses/${courseId}/reports`;

export async function getActivity(
  token: string,
  courseId: number,
): Promise<Schemas["ActivityOut"] | null> {
  return read(token, `${base(courseId)}/activity`);
}

// `since` is a Unix epoch second; without it the report covers everything.
export async function getUsage(
  token: string,
  courseId: number,
  since?: number,
): Promise<Schemas["UsageOut"] | null> {
  const suffix = since != null ? `?since=${since}` : "";
  return read(token, `${base(courseId)}/usage${suffix}`);
}

export async function getHealth(
  token: string,
  courseId: number,
): Promise<Schemas["app__reports__routes__HealthOut"] | null> {
  return read(token, `${base(courseId)}/health`);
}

export async function getRubricAgreement(
  token: string,
  courseId: number,
): Promise<Schemas["RubricAgreementOut"] | null> {
  return read(token, `${base(courseId)}/rubric-agreement`);
}

async function read<T>(token: string, url: string): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as T;
}
