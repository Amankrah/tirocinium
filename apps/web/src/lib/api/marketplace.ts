// The materials marketplace, seat side (Phase 10, decision 0062). Server-side
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
export type Rfq = Schemas["RfqOut"];
export type RfqRequest = Schemas["RfqIn"];

export type LineQuery = {
  supplier?: string | null;
  category?: string | null;
  tag?: string | null;
  q?: string | null;
  sort?: string | null;
  cursor?: number;
  limit?: number;
};

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
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const suffix = search.size > 0 ? `?${search}` : "";
  return call(token, `/variants/${variantId}/marketplace/lines${suffix}`);
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
