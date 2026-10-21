import Link from "next/link";
import { notFound } from "next/navigation";

import { allProjectLines, getProjectMarketplace } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../../strings";
import { Filters, list, sortOf } from "../../_kit/filters";
import { LineGrid } from "../../_kit/line-card";

// One supplier's catalogue (decision 0101): who they are, the terms they
// trade on (read before quoting, because a minimum order changes a cost), and
// their lines with the filter column. Facets count the supplier's whole
// catalogue rather than the filtered view, so ticking a box never hides the
// boxes beside it.
export default async function StorePage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const { supplierId } = await params;
  const query = await searchParams;

  const front = await getProjectMarketplace(token);
  if (!front.ok) throw new Error(s.offline);
  const entry = front.data.suppliers.find((item) => item.supplier.id === supplierId);
  if (!entry) notFound();
  const { supplier } = entry;

  const chosenCategories = list(query.category);
  const chosenTags = list(query.tag);
  const sort = sortOf(query.sort);

  const [whole, shown] = await Promise.all([
    allProjectLines(token, { supplier: supplier.id }),
    allProjectLines(token, {
      supplier: supplier.id,
      category: chosenCategories,
      tag: chosenTags,
      sort,
    }),
  ]);
  if (!whole.ok || !shown.ok) throw new Error(s.offline);

  const categories = [...new Set(whole.data.items.map((line) => line.category))].map((value) => ({
    value,
    count: whole.data.items.filter((line) => line.category === value).length,
  }));
  const tags = [...new Set(whole.data.items.flatMap((line) => line.tags))]
    .sort()
    .slice(0, 16)
    .map((value) => ({ value }));

  return (
    <>
      <nav aria-label={p.breadcrumb} className="text-sm text-ink-muted">
        <Link href="/marketplace" className="underline hover:text-ink">
          {p.home}
        </Link>{" "}
        › {supplier.name}
      </nav>

      <header className="flex flex-col gap-3 border-b border-rule-line pb-6">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="font-display text-4xl leading-none">
            {supplier.glyph}
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-4xl">{supplier.name}</h1>
            <p className="text-ink-muted">
              {p.supplierLine(supplier.tagline, supplier.city, supplier.established)}
            </p>
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-ink-muted">{p.lineItems}</dt>
            <dd className="font-mono tabular-nums">{entry.line_count}</dd>
          </div>
          <div className="max-w-md">
            <dt className="text-xs text-ink-muted">{p.shipping}</dt>
            <dd>{supplier.shipping}</dd>
          </div>
        </dl>
        <p className="max-w-[var(--measure-reading)] text-ink-muted">{supplier.blurb}</p>
        <div className="max-w-[var(--measure-reading)] rounded-lg border border-rule-line p-4 text-sm">
          <p>
            <strong className="font-medium">{p.tradingTerms}</strong> {supplier.policy}
          </p>
          <p className="mt-1 text-ink-muted">{supplier.minimum_order_note}</p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Filters
          action={`/marketplace/store/${supplier.id}`}
          categories={categories}
          tags={tags}
          chosenCategories={chosenCategories}
          chosenTags={chosenTags}
          sort={sort}
        />
        <section aria-labelledby="lines" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="lines" className="font-display text-2xl">
              {p.lineCount(shown.data.total)}
            </h2>
            <p className="text-xs text-ink-muted">{p.trayHint}</p>
          </div>
          {shown.data.items.length > 0 ? (
            <LineGrid lines={shown.data.items} />
          ) : (
            <p className="text-sm text-ink-muted">{p.noneMatch}</p>
          )}
        </section>
      </div>
    </>
  );
}
