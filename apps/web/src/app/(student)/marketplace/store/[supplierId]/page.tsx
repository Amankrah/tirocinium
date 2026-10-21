import Link from "next/link";
import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { allProjectLines, getProjectMarketplace } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../../strings";
import { Filters, list, sortOf } from "../../_kit/filters";
import { LineGrid } from "../../_kit/line-card";

// One supplier's catalogue (decision 0101, restyled in 0105): who they are,
// the terms they trade on (read before quoting, because a minimum order
// changes a cost), a row of the other suppliers so a student can hop between
// stores without going home, and their lines with the filter column. Facets
// count the supplier's whole catalogue rather than the filtered view, so
// ticking a box never hides the boxes beside it.
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
      <nav aria-label={p.breadcrumb} className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
        <Link
          href="/marketplace"
          className="rounded-sm transition-colors duration-(--motion-duration) ease-(--motion-ease) hover:text-ink focus-ring"
        >
          {p.home}
        </Link>
        <Icon name="chevron-right" size={14} />
        <span className="text-ink">{supplier.name}</span>
      </nav>

      <header className="flex flex-col gap-5 border-b border-rule-line pb-8">
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-md bg-surface-sunken font-display text-3xl leading-none"
          >
            {supplier.glyph}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-display text-4xl leading-[1.05]">{supplier.name}</h1>
            <p className="text-ink-muted">
              {p.supplierLine(supplier.tagline, supplier.city, supplier.established)}
            </p>
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-10 gap-y-2 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-ink-muted">{p.lineItems}</dt>
            <dd className="font-mono tabular-nums">{entry.line_count}</dd>
          </div>
          <div className="flex max-w-md flex-col gap-0.5">
            <dt className="text-xs text-ink-muted">{p.shipping}</dt>
            <dd>{supplier.shipping}</dd>
          </div>
        </dl>
        <p className="max-w-[var(--measure-reading)] text-pretty text-ink-muted">{supplier.blurb}</p>
        <Card tone="sunken" className="flex max-w-[var(--measure-reading)] gap-3 text-sm">
          <Icon name="lock" size={16} className="mt-0.5 shrink-0 text-ink-muted" />
          <div className="flex flex-col gap-1">
            <p>
              <strong className="font-medium">{p.tradingTerms}</strong> {supplier.policy}
            </p>
            <p className="text-ink-muted">{supplier.minimum_order_note}</p>
          </div>
        </Card>
        <nav aria-label={p.switchSupplier}>
          <ul className="flex flex-wrap gap-2">
            {front.data.suppliers.map((other) => {
              const current = other.supplier.id === supplier.id;
              return (
                <li key={other.supplier.id}>
                  <Link
                    href={`/marketplace/store/${other.supplier.id}`}
                    aria-current={current ? "page" : undefined}
                    className={
                      "inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-sm " +
                      "transition-colors duration-(--motion-duration) ease-(--motion-ease) focus-ring " +
                      (current
                        ? "border-ink bg-ink font-medium text-paper"
                        : "border-rule-line bg-surface text-ink hover:border-ink")
                    }
                  >
                    <span aria-hidden="true" className="font-display leading-none">
                      {other.supplier.glyph}
                    </span>
                    {other.supplier.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
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
        <section aria-labelledby="lines" className="flex flex-col gap-5">
          <SectionHeading id="lines" title={p.lineCount(shown.data.total)} description={p.trayHint} />
          {shown.data.items.length > 0 ? (
            <LineGrid lines={shown.data.items} />
          ) : (
            <EmptyState icon="search" body={p.noneMatch} />
          )}
        </section>
      </div>
    </>
  );
}
