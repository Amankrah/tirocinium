import { getProjectLine } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { askAction } from "../actions";
import { RequestView } from "../_kit/request-view";

// Request a quotation (decision 0101). Arriving from a line (?sku=) fills the
// line in and lets the reply offer to put it in the quote.
export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>;
}) {
  const { token } = await requireSeat();
  const { sku } = await searchParams;
  const found = sku ? await getProjectLine(token, sku) : null;
  const line = found?.ok ? found.data : null;
  return <RequestView initialSku={line?.sku ?? sku ?? ""} line={line} ask={askAction} />;
}
