// The materials marketplace, professor side (Phase 10, decision 0062).
// Server-side only: the JWT never reaches client JavaScript (decision 0012).
//
// Three things live here, matching the backend's three: which catalogue version
// the course is pinned to, the shortlist a case study points at, and the
// quotations the cohort actually issued. Prices on this side are list prices,
// never a seat's struck price, because per-variant pricing only means anything
// while nobody else can read the number a student is holding.
import { apiCall as call, type Result, type Schemas } from "./client";

export type Catalogues = Schemas["CataloguesOut"];
export type CatalogueChoice = Schemas["CatalogueChoice"];
export type AuthoringCatalogue = Schemas["AuthoringCatalogueOut"];
export type AuthoringLine = Schemas["AuthoringLine"];
export type Shortlist = Schemas["ShortlistOut"];
export type QuoteReview = Schemas["QuoteReviewOut"];

export function listCatalogues(
  token: string,
  courseId: number,
): Promise<Result<Catalogues>> {
  return call(token, `/courses/${courseId}/catalogues`);
}

// Null for both turns the marketplace off for the course. Issued quotations
// name their own catalogue version and are unaffected, which is why unpinning
// is an ordinary act rather than a destructive one.
export function pinCatalogue(
  token: string,
  courseId: number,
  choice: { id: string; version: number } | null,
): Promise<Result<Catalogues>> {
  return call(token, `/courses/${courseId}/catalogue`, {
    method: "PUT",
    body: {
      catalogue_id: choice?.id ?? null,
      catalogue_version: choice?.version ?? null,
    },
  });
}

export function getAuthoringCatalogue(
  token: string,
  courseId: number,
  caseStudyId?: number,
): Promise<Result<AuthoringCatalogue>> {
  const suffix = caseStudyId === undefined ? "" : `?case_study_id=${caseStudyId}`;
  return call(token, `/courses/${courseId}/catalogue${suffix}`);
}

export function getShortlist(
  token: string,
  courseId: number,
  caseStudyId: number,
): Promise<Result<Shortlist>> {
  return call(token, `/courses/${courseId}/case-studies/${caseStudyId}/shortlist`);
}

// A whole replacement, and the order is the meaning: the first SKU is the one
// the student meets first.
export function setShortlist(
  token: string,
  courseId: number,
  caseStudyId: number,
  skus: string[],
): Promise<Result<Shortlist>> {
  return call(token, `/courses/${courseId}/case-studies/${caseStudyId}/shortlist`, {
    method: "PUT",
    body: { skus },
  });
}

export function reviewQuotes(
  token: string,
  courseId: number,
  query: { caseStudyId?: number; cursor?: number; limit?: number } = {},
): Promise<Result<QuoteReview>> {
  const search = new URLSearchParams();
  if (query.caseStudyId !== undefined) {
    search.set("case_study_id", String(query.caseStudyId));
  }
  if (query.cursor !== undefined) search.set("cursor", String(query.cursor));
  if (query.limit !== undefined) search.set("limit", String(query.limit));
  const suffix = search.size > 0 ? `?${search}` : "";
  return call(token, `/courses/${courseId}/quotes${suffix}`);
}
