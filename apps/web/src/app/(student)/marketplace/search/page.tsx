import Link from "next/link";

import { Button } from "@/components/ui/button";
import { allProjectLines } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../strings";
import { Filters, list, sortOf } from "../_kit/filters";
import { LineGrid } from "../_kit/line-card";

// Search across every supplier (decision 0101), with the same filter column
// as a store. An empty query browses the whole catalogue, so this page is also
// "everything", filtered. The server searches names, SKUs, specs, categories,
// attributes, descriptions and supplier names.
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
        › {p.search}
      </nav>
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl">
          {q ? p.resultsFor(shown.data.total, q) : p.everything(shown.data.total)}
        </h1>
        <form action="/marketplace/search" role="search" className="flex max-w-xl gap-2">
          <label htmlFor="search-page-q" className="sr-only">
            {s.search}
          </label>
          <input
            id="search-page-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={p.searchPlaceholder}
            className="flex-1 rounded-md border border-field-border bg-transparent px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <Button type="submit">{p.search}</Button>
        </form>
      </header>

      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Filters
          action="/marketplace/search"
          categories={categories}
          tags={tags}
          chosenCategories={chosenCategories}
          chosenTags={chosenTags}
          sort={sort}
          hidden={q ? { q } : {}}
        />
        <section aria-label={p.results} className="flex flex-col gap-3">
          {shown.data.items.length > 0 ? (
            <LineGrid lines={shown.data.items} />
          ) : (
            <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">{p.noResults}</p>
          )}
        </section>
      </div>
    </>
  );
}
