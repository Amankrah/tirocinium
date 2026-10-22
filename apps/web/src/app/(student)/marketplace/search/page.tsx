import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { allProjectLines } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../strings";
import { ActiveFilters, Filters, list, sortOf } from "../_kit/filters";
import { LineGrid } from "../_kit/line-card";

// Search across every supplier (decision 0101, restyled in 0105), with the
// same filter column as a store. An empty query browses the whole catalogue,
// so this page is also "everything", filtered. The server searches names,
// SKUs, specs, categories, attributes, descriptions and supplier names.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const query = await searchParams;
  const q = (list(query.q)[0] ?? "").trim();
  const chosenCategories = list(query.category);
  const chosenTags = list(query.tag);
  const sort = sortOf(query.sort);

  const [whole, shown] = await Promise.all([
    allProjectLines(token, { q: q || null }),
    allProjectLines(token, { q: q || null, category: chosenCategories, tag: chosenTags, sort }),
  ]);
  if (!whole.ok || !shown.ok) throw new Error(s.offline);

  const categories = [...new Set(whole.data.items.map((line) => line.category))].sort().map((value) => ({
    value,
    count: whole.data.items.filter((line) => line.category === value).length,
  }));
  // The attributes a student is most likely to filter on: the most frequent
  // two dozen, with their counts, since the sheet folds past the first eight
  // (decision 0107). Ties fall alphabetically.
  const tagCounts = new Map<string, number>();
  for (const line of whole.data.items) {
    for (const tag of line.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const tags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 24)
    .map(([value, count]) => ({ value, count }));

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
        <span className="text-ink">{p.search}</span>
      </nav>

      <header className="flex flex-col gap-5">
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">
          {q ? p.resultsFor(shown.data.total, q) : p.everything(shown.data.total)}
        </h1>
        <form action="/marketplace/search" role="search" className="flex max-w-xl gap-2">
          <div className="relative flex min-w-0 flex-1 items-center">
            <label htmlFor="search-page-q" className="sr-only">
              {s.search}
            </label>
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 text-ink-muted" />
            <Input
              id="search-page-q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder={p.searchPlaceholder}
              enterKeyHint="search"
              className="pl-9"
            />
          </div>
          <Button type="submit">{p.search}</Button>
        </form>
      </header>

      <div className="grid gap-8 lg:grid-cols-[16.5rem_minmax(0,1fr)]">
        <Filters
          action="/marketplace/search"
          categories={categories}
          tags={tags}
          chosenCategories={chosenCategories}
          chosenTags={chosenTags}
          sort={sort}
          hidden={q ? { q } : {}}
        />
        <section aria-label={p.results} className="flex flex-col gap-4">
          <ActiveFilters
            action="/marketplace/search"
            chosenCategories={chosenCategories}
            chosenTags={chosenTags}
            sort={sort}
            hidden={q ? { q } : {}}
          />
          {shown.data.items.length > 0 ? (
            <LineGrid lines={shown.data.items} />
          ) : (
            <EmptyState icon="search" body={p.noResults} />
          )}
        </section>
      </div>
    </>
  );
}
