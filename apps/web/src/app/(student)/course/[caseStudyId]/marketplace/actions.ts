"use server";

// Every marketplace mutation the student makes, run server-side so the seat
// token stays out of client JavaScript (decision 0011). The client passes ids
// and never a price: what a line costs is settled by the server against the
// variant's seed, and a basket that could name its own prices would not be
// worth defending.
import {
  compareLines,
  createQuote,
  discardQuote,
  issueQuote,
  listLines,
  replaceQuoteLines,
  submitRfq,
  type Comparison,
  type LineList,
  type LineQuery,
  type Quote,
  type QuoteLine,
  type Result,
  type Rfq,
  type RfqRequest,
} from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";

export async function listLinesAction(
  variantId: number,
  query: LineQuery,
): Promise<Result<LineList>> {
  const { token } = await requireSeat();
  return listLines(token, variantId, query);
}

export async function compareLinesAction(
  variantId: number,
  skus: string[],
): Promise<Result<Comparison>> {
  const { token } = await requireSeat();
  return compareLines(token, variantId, skus);
}

export async function saveQuoteAction(
  variantId: number,
  quoteId: number | null,
  lines: QuoteLine[],
): Promise<Result<Quote>> {
  const { token } = await requireSeat();
  // One action for both, because from the student's side there is no
  // difference: they changed their basket. The first change opens the
  // quotation; every later one replaces it whole.
  return quoteId === null
    ? createQuote(token, variantId, lines)
    : replaceQuoteLines(token, quoteId, lines);
}

export async function issueQuoteAction(quoteId: number): Promise<Result<Quote>> {
  const { token } = await requireSeat();
  return issueQuote(token, quoteId);
}

export async function discardQuoteAction(quoteId: number): Promise<Result<void>> {
  const { token } = await requireSeat();
  return discardQuote(token, quoteId);
}

export async function submitRfqAction(
  variantId: number,
  request: RfqRequest,
): Promise<Result<Rfq>> {
  const { token } = await requireSeat();
  return submitRfq(token, variantId, request);
}
