import Link from "next/link";

import { allProjectLines, getProjectMarketplace } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../strings";

// Every project brief the catalogue maps (decision 0101), each with the lines
// a credible shortlist would draw on. The supplier count is read from the
// lines themselves, never guessed from a SKU's prefix.
export default async function BriefsPage() {
  const { token } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const [front, lines] = await Promise.all([getProjectMarketplace(token), allProjectLines(token)]);
  if (!front.ok || !lines.ok) throw new Error(s.offline);
  const supplierOf = new Map(lines.data.items.map((line) => [line.sku, line.supplier_id]));

  return (
    <>
      <nav aria-label={p.breadcrumb} className="text-sm text-ink-muted">
        <Link href="/marketplace" className="underline hover:text-ink">
          {p.home}
        </Link>{" "}
        › {p.briefs}
      </nav>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl">{p.briefs}</h1>
        <p className="max-w-[var(--measure-reading)] text-ink-muted">{p.briefsLede}</p>
      </header>
      <ul className="grid gap-4 md:grid-cols-2">
        {front.data.briefs.map((brief, index) => {
          const stocked = brief.shortlist.filter((sku) => supplierOf.has(sku));
          const suppliers = new Set(stocked.map((sku) => supplierOf.get(sku))).size;
          return (
            <li key={brief.id} className="flex flex-col gap-2 rounded-lg border border-rule-line p-4">
              <p className="font-mono text-xs text-ink-muted">{p.briefNumber(index + 1)}</p>
              <Link
                href={`/marketplace/briefs/${brief.id}`}
                className="font-display text-lg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {brief.title}
              </Link>
              <p className="text-sm text-ink-muted">
                <span className="font-medium text-ink">{p.keyFunctions}</span>{" "}
                {brief.selection_factors.join(" · ")}
              </p>
              <p className="text-sm">
                <span className="font-medium">{p.challenge}</span> {brief.candidate_families}
              </p>
              <p className="mt-auto text-xs text-ink-muted">{p.candidates(stocked.length, suppliers)}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
