"use server";

// The project marketplace's calls (decision 0100), run server-side so the seat
// token stays out of client JavaScript (decision 0011). The client sends SKUs
// and quantities and never a price: the server prices the basket at list
// prices and answers with the one account of the money.
import {
  askProjectSupplier,
  commitSelection,
  compareProjectLines,
  listProjectLines,
  prepareProjectQuotation,
  type Comparison,
  type LineList,
  type LineQuery,
  type ProjectQuotation,
  type ProjectRfq,
  type QuoteLine,
  type Result,
  type RfqRequest,
  scoreMatrix,
  type Challenge,
  type Matrix,
  type SelectionRequest,
} from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";

export async function browseAction(query: LineQuery): Promise<Result<LineList>> {
  const { token } = await requireSeat();
  return listProjectLines(token, query);
}

export async function compareAction(skus: string[]): Promise<Result<Comparison>> {
  const { token } = await requireSeat();
  return compareProjectLines(token, skus);
}

export async function priceAction(lines: QuoteLine[]): Promise<Result<ProjectQuotation>> {
  const { token } = await requireSeat();
  return prepareProjectQuotation(token, lines);
}

export async function askAction(request: RfqRequest): Promise<Result<ProjectRfq>> {
  const { token } = await requireSeat();
  return askProjectSupplier(token, request);
}

export async function matrixAction(
  skus: string[],
  weights: Record<string, number>,
): Promise<Result<Matrix>> {
  const { token } = await requireSeat();
  return scoreMatrix(token, skus, weights);
}

export async function commitSelectionAction(
  key: string,
  request: SelectionRequest,
): Promise<Result<Challenge>> {
  const { token } = await requireSeat();
  return commitSelection(token, key, request);
}
