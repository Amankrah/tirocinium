import { getProjectMarketplace } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../strings";
import { QuoteView } from "../_kit/quote-view";

// The quote page (decisions 0100 and 0101). The basket is held by the
// marketplace layout; this page hands the view what the printed quotation
// names: the catalogue, its suppliers and where they ship from.
export default async function QuotePage() {
  const { token } = await requireSeat();
  const p = strings.project;
  const front = await getProjectMarketplace(token);
  if (!front.ok) throw new Error(strings.marketplace.offline);
  const market = front.data;
  return (
    <QuoteView
      title={market.title}
      basis={p.basis(market.title, market.catalogue_version)}
      currency={market.currency}
      suppliers={market.suppliers.map(({ supplier }) => ({
        id: supplier.id,
        name: supplier.name,
        city: supplier.city,
      }))}
    />
  );
}
