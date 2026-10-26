// The materials marketplace, seat side (Phase 10, decision 0076). Server-side
// only, like every other seat-facing call: the token stays out of client
// JavaScript (decision 0011).
import { apiCall as call, type Result, type Schemas } from "./client";

export type { Result };

export type Marketplace = Schemas["MarketplaceOut"];
export type LineSummary = Schemas["LineSummary"];
export type LineDetail = Schemas["LineDetail"];
export type LineList = Schemas["LineListOut"];
export type Comparison = Schemas["CompareOut"];
export type Quote = Schemas["QuoteOut"];
export type QuoteLine = Schemas["QuoteLineIn"];
export type Piece = Schemas["PieceIn"];
export type StockGeometry = Schemas["StockGeometry"];
export type Rfq = Schemas["RfqOut"];
export type RfqRequest = Schemas["RfqIn"];

// A list filter (category, tag, sku) repeats its parameter; a single value is
// still accepted, so a select box and a set of ticked boxes share one shape.
export type LineQuery = {
  supplier?: string | null;
  category?: string | string[] | null;
  tag?: string | string[] | null;
  sku?: string[] | null;
  q?: string | null;
  sort?: string | null;
  cursor?: number;
  limit?: number;
};

function lineSearch(query: LineQuery): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== "") search.append(key, String(item));
    }
  }
  return search.size > 0 ? `?${search}` : "";
}

export function getMarketplace(
  token: string,
  variantId: number,
): Promise<Result<Marketplace>> {
  return call(token, `/variants/${variantId}/marketplace`);
}

export function listLines(
  token: string,
  variantId: number,
  query: LineQuery = {},
): Promise<Result<LineList>> {
  return call(token, `/variants/${variantId}/marketplace/lines${lineSearch(query)}`);
}

export function getLine(
  token: string,
  variantId: number,
  sku: string,
): Promise<Result<LineDetail>> {
  return call(
    token,
    `/variants/${variantId}/marketplace/lines/${encodeURIComponent(sku)}`,
  );
}

export function compareLines(
  token: string,
  variantId: number,
  skus: string[],
): Promise<Result<Comparison>> {
  return call(token, `/variants/${variantId}/marketplace/compare`, {
    method: "POST",
    body: { skus },
  });
}

export function createQuote(
  token: string,
  variantId: number,
  lines: QuoteLine[],
): Promise<Result<Quote>> {
  return call(token, `/variants/${variantId}/quotes`, {
    method: "POST",
    body: { lines },
  });
}

export function listQuotes(
  token: string,
  variantId: number,
): Promise<Result<Schemas["QuoteListOut"]>> {
  return call(token, `/variants/${variantId}/quotes`);
}

export function getQuote(token: string, quoteId: number): Promise<Result<Quote>> {
  return call(token, `/quotes/${quoteId}`);
}

export function replaceQuoteLines(
  token: string,
  quoteId: number,
  lines: QuoteLine[],
): Promise<Result<Quote>> {
  return call(token, `/quotes/${quoteId}`, { method: "PUT", body: { lines } });
}

export function issueQuote(token: string, quoteId: number): Promise<Result<Quote>> {
  return call(token, `/quotes/${quoteId}/issue`, { method: "POST" });
}

export function discardQuote(token: string, quoteId: number): Promise<Result<void>> {
  return call(token, `/quotes/${quoteId}`, { method: "DELETE" });
}

export function submitRfq(
  token: string,
  variantId: number,
  request: RfqRequest,
): Promise<Result<Rfq>> {
  return call(token, `/variants/${variantId}/marketplace/rfqs`, {
    method: "POST",
    body: request,
  });
}

/**
 * Whether a problem view should offer "Price your materials" (decision 0081).
 *
 * Two facts have to line up. The course must price materials at all, which the
 * front door answers by succeeding rather than returning 409. And this
 * particular case study must be a selection decision, which the professor says
 * by giving it a shortlist. A pricing course full of crystal-structure
 * questions would otherwise show the link on every one of them, and a control
 * with nothing behind it is worse than no control (frontend guide 4.1).
 *
 * This gates the invitation only. The shortlist never restricts what a student
 * can reach once inside the marketplace, which is decision 0076's rule and is
 * not weakened here.
 */
export function offersMarketplace(
  marketplace: Result<Marketplace> | null,
): boolean {
  return marketplace?.ok === true && marketplace.data.shortlist.length > 0;
}

// ---------------------------------------------------------------------------
// The project marketplace (decision 0100): any seat, outside any case study, at
// the catalogue's list prices. Nothing here is stored: the quotation is priced
// on request and handed back for the student to print.
// ---------------------------------------------------------------------------

export type ProjectMarketplace = Schemas["ProjectMarketplaceOut"];
export type ProjectQuotation = Schemas["ProjectQuotationOut"];
export type ProjectRfq = Schemas["ProjectRfqOut"];
export type Brief = Schemas["Brief"];

export function getProjectMarketplace(token: string): Promise<Result<ProjectMarketplace>> {
  return call(token, "/marketplace");
}

export function listProjectLines(
  token: string,
  query: LineQuery = {},
): Promise<Result<LineList>> {
  return call(token, `/marketplace/lines${lineSearch(query)}`);
}

export function getProjectLine(token: string, sku: string): Promise<Result<LineDetail>> {
  return call(token, `/marketplace/lines/${encodeURIComponent(sku)}`);
}

/** Every line in the catalogue, paging through the server's limit. */
export async function allProjectLines(
  token: string,
  query: LineQuery = {},
): Promise<Result<LineList>> {
  const items: LineSummary[] = [];
  let cursor: number | null = 0;
  while (cursor !== null) {
    const page: Result<LineList> = await listProjectLines(token, { ...query, cursor, limit: 96 });
    if (!page.ok) return page;
    items.push(...page.data.items);
    cursor = page.data.next_cursor;
  }
  return { ok: true, data: { items, next_cursor: null, total: items.length } };
}

export function compareProjectLines(
  token: string,
  skus: string[],
): Promise<Result<Comparison>> {
  return call(token, "/marketplace/compare", { method: "POST", body: { skus } });
}

export function prepareProjectQuotation(
  token: string,
  lines: QuoteLine[],
): Promise<Result<ProjectQuotation>> {
  return call(token, "/marketplace/quotation", { method: "POST", body: { lines } });
}

export function askProjectSupplier(
  token: string,
  request: RfqRequest,
): Promise<Result<ProjectRfq>> {
  return call(token, "/marketplace/rfq", { method: "POST", body: request });
}

// ---------------------------------------------------------------------------
// Project challenges (decision 0112): the requirements a student works from,
// the matrix they weight, and the selection they commit. The author's answer
// arrives only inside a committed challenge's `reveal`.
// ---------------------------------------------------------------------------

export type ChallengeSummary = Schemas["ChallengeSummary"];
export type Challenge = Schemas["ChallengeOut"];
export type Selection = Schemas["SelectionOut"];
export type Reveal = Schemas["RevealOut"];
export type Matrix = Schemas["MatrixOut"];
export type MatrixCriterion = Schemas["MatrixCriterion"];
export type Criterion = Schemas["CriterionOut"];
export type Requirement = Schemas["Requirement"];
export type SelectionRequest = Schemas["SelectionIn"];

export function listChallenges(token: string): Promise<Result<ChallengeSummary[]>> {
  return call(token, "/marketplace/challenges");
}

export function getChallenge(token: string, key: string): Promise<Result<Challenge>> {
  return call(token, `/marketplace/challenges/${encodeURIComponent(key)}`);
}

export function scoreMatrix(
  token: string,
  skus: string[],
  weights: Record<string, number>,
): Promise<Result<Matrix>> {
  return call(token, "/marketplace/matrix", { method: "POST", body: { skus, weights } });
}

export function commitSelection(
  token: string,
  key: string,
  request: SelectionRequest,
): Promise<Result<Challenge>> {
  return call(token, `/marketplace/challenges/${encodeURIComponent(key)}/selection`, {
    method: "POST",
    body: request,
  });
}
