// The fig:// resolver (decision 0066, closing what decision 0014 deferred). A
// case study body, a generated variant body, and a worked solution all carry
// `fig://{id}` tokens at the position the professor's diagram sits in the text;
// this turns those tokens into the pixels behind them so every reading surface
// can render a figure exactly as extracted (constraint 2).
//
// Server-side only, like every other module here: it carries the caller's token
// and the backend origin. Authorization is not restated on this side. The one
// endpoint it calls (decision 0032) already answers a professor-owner for any
// figure in the course and a seat only for a figure a published case study
// carries, so a seat surface cannot resolve what it may not read.
import { apiBaseUrl, type Schemas } from "./client";
import type { Figure, FigureMap } from "@/components/reading/problem-body";

// Ids as the backend mints them are integers, but the token is matched as the
// opaque string it is. A token ends at the first character that cannot be part
// of an id, which is how `(fig://12)` and `fig://12.` both resolve to 12.
const FIG_TOKEN = /fig:\/\/([A-Za-z0-9_-]+)/g;

// Pure, so the scan is testable without a network: every distinct figure id in
// a markdown body, in the order it first appears.
export function figureIdsIn(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(FIG_TOKEN)) {
    const id = match[1];
    if (id) seen.add(id);
  }
  return [...seen];
}

async function resolveOne(
  token: string,
  courseId: number,
  figureId: string,
): Promise<Figure | null> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/api/v1/courses/${courseId}/figures/${figureId}`,
      { headers: { authorization: `Bearer ${token}` }, cache: "no-store" },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const figure = (await response.json()) as Schemas["FigureImageOut"];
  return {
    src: figure.image_url,
    src2x: figure.image_url_2x,
    width: figure.width_px,
    height: figure.height_px,
  };
}

// Resolve every figure a body references, each distinct id once and all of them
// at once. A figure that does not resolve is left out of the map rather than
// faked, which renders the honest "Figure unavailable" marker: a figure is never
// silently omitted or substituted. A body with no tokens makes no request.
export async function resolveFigures(
  token: string,
  courseId: number,
  body: string,
): Promise<FigureMap> {
  const ids = figureIdsIn(body);
  if (ids.length === 0) return {};
  const resolved = await Promise.all(
    ids.map(async (id) => [id, await resolveOne(token, courseId, id)] as const),
  );
  const map: FigureMap = {};
  for (const [id, figure] of resolved) if (figure) map[id] = figure;
  return map;
}

// The same resolution over several bodies at once (a solution beside its
// re-solve, three preview variants), sharing one round trip per distinct figure
// across all of them rather than one per body.
export async function resolveFiguresForBodies(
  token: string,
  courseId: number,
  bodies: readonly (string | null | undefined)[],
): Promise<FigureMap> {
  return resolveFigures(token, courseId, bodies.filter(Boolean).join("\n"));
}
