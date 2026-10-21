"use client";

// Browsing the catalogue, shared by both marketplaces (decisions 0076 and
// 0100): the filters, the sort, the grid of lines, and paging. Each surface
// supplies how it reaches the server (the case-study one prices against a
// variant, the project one at list prices) and what adding or comparing a line
// means to it; the browsing itself is the same.
//
// Filtering narrows and never restricts. Every line stays reachable however
// the filters are set, because deciding that a material is wrong is the
// exercise, and a catalogue that hid the wrong answers would be doing it for
// them. Filters refetch through the server rather than narrowing the page
// already held, because the catalogue is paginated and a client-side filter
// would quietly stop at the page boundary.
import { useCallback, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { LineList, LineQuery, LineSummary, Result } from "@/lib/api/marketplace";
import { lead, money } from "@/lib/money";
import { strings } from "../strings";

const PAGE = 24;

export const SELECT =
  "rounded-md border border-rule-line bg-transparent px-3 py-2 text-sm " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

type Supplier = { id: string; name: string };

export type Catalogue = ReturnType<typeof useCatalogue>;

export function useCatalogue(
  initialLines: LineList,
  browse: (query: LineQuery) => Promise<Result<LineList>>,
) {
  const [lines, setLines] = useState<LineList>(initialLines);
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<string>("relevance");
  const [pending, startTransition] = useTransition();

  const refilter = useCallback(
    (next: Partial<{ search: string; supplier: string; category: string; sort: string }>) => {
      const nextSupplier = next.supplier ?? supplier;
      const nextCategory = next.category ?? category;
      const nextSearch = next.search ?? search;
      const nextSort = next.sort ?? sort;
      if (next.supplier !== undefined) setSupplier(next.supplier);
      if (next.category !== undefined) setCategory(next.category);
      if (next.sort !== undefined) setSort(next.sort);
      startTransition(async () => {
        const result = await browse({
          supplier: nextSupplier || null,
          category: nextCategory || null,
          q: nextSearch || null,
          sort: nextSort,
          cursor: 0,
          limit: PAGE,
        });
        if (result.ok) setLines(result.data);
      });
    },
    [browse, supplier, category, search, sort],
  );

  const loadMore = useCallback(() => {
    if (lines.next_cursor === null) return;
    const cursor = lines.next_cursor;
    startTransition(async () => {
      const result = await browse({
        supplier: supplier || null,
        category: category || null,
        q: search || null,
        sort,
        cursor,
        limit: PAGE,
      });
      if (result.ok) {
        setLines((current) => ({
          items: [...current.items, ...result.data.items],
          next_cursor: result.data.next_cursor,
          total: result.data.total,
        }));
      }
    });
  }, [browse, lines.next_cursor, supplier, category, search, sort]);

  return { lines, search, setSearch, supplier, category, sort, refilter, loadMore, pending };
}

export function CatalogueSection({
  catalogue,
  suppliers,
  categories,
  relevanceLabel,
  inBasket,
  comparing,
  onAdd,
  onCompare,
}: {
  catalogue: Catalogue;
  suppliers: Supplier[];
  categories: string[];
  // What "relevance" means on this surface: the professor's shortlist first
  // on a case study, the catalogue's own order on a project.
  relevanceLabel: string;
  inBasket: Set<string>;
  comparing: string[];
  onAdd: (line: LineSummary) => void;
  onCompare: (sku: string) => void;
}) {
  const s = strings.marketplace;
  const { lines, search, setSearch, supplier, category, sort, refilter, loadMore, pending } =
    catalogue;
  const sorts = [
    ["relevance", relevanceLabel],
    ["price_asc", s.sortPriceAsc],
    ["price_desc", s.sortPriceDesc],
    ["lead", s.sortLead],
    ["name", s.sortName],
  ] as const;

  return (
    <section aria-labelledby="catalogue" className="flex flex-col gap-4">
      <h2 id="catalogue" className="font-display text-2xl">
        {s.title}
      </h2>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="sr-only">{s.search}</span>
          <input
            type="search"
            value={search}
            placeholder={s.searchPlaceholder}
            aria-label={s.search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            onBlur={() => refilter({})}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                refilter({});
              }
            }}
            className="min-w-48 rounded-md border border-rule-line bg-transparent px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </label>

        <select
          aria-label={s.allSuppliers}
          value={supplier}
          onChange={(event) => refilter({ supplier: event.currentTarget.value })}
          className={SELECT}
        >
          <option value="">{s.allSuppliers}</option>
          {suppliers.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>

        <select
          aria-label={s.allCategories}
          value={category}
          onChange={(event) => refilter({ category: event.currentTarget.value })}
          className={SELECT}
        >
          <option value="">{s.allCategories}</option>
          {categories.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <select
          aria-label={s.sort}
          value={sort}
          onChange={(event) => refilter({ sort: event.currentTarget.value })}
          className={SELECT}
        >
          {sorts.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <p className="font-mono text-xs tabular-nums text-ink-muted">
        {s.resultCount(lines.total)}
      </p>

      {lines.items.length === 0 ? (
        <p className="text-sm text-ink-muted">{s.noResults}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {lines.items.map((line) => (
            <LineCard
              key={line.sku}
              line={line}
              inBasket={inBasket.has(line.sku)}
              comparing={comparing.includes(line.sku)}
              onAdd={() => onAdd(line)}
              onCompare={() => onCompare(line.sku)}
            />
          ))}
        </ul>
      )}

      {lines.next_cursor !== null ? (
        <div>
          <Button variant="quiet" onClick={loadMore} disabled={pending}>
            {s.more}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function LineCard({
  line,
  inBasket,
  comparing,
  onAdd,
  onCompare,
}: {
  line: LineSummary;
  inBasket: boolean;
  comparing: boolean;
  onAdd: () => void;
  onCompare: () => void;
}) {
  const s = strings.marketplace;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-rule-line p-4">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{line.name}</span>
        <span className="text-xs text-ink-muted">{line.spec}</span>
        <span className="text-xs text-ink-muted">{line.supplier_name}</span>
      </div>

      <div className="flex flex-col gap-0.5 font-mono text-sm tabular-nums">
        <span>{s.perUnit(money(line.price_cents), line.unit_label)}</span>
        {line.price_per_kg_cents !== null ? (
          <span className="text-xs text-ink-muted">
            {s.perKilo(money(Math.round(line.price_per_kg_cents)))}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5 text-xs text-ink-muted">
        <span>{s.minimumOrder(String(line.moq), line.unit_label)}</span>
        <span>
          {lead(line.lead_days)} · {line.stock_label}
        </span>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        <Button onClick={onAdd} disabled={inBasket} className="text-sm">
          {inBasket ? s.added : s.add}
        </Button>
        <button
          type="button"
          onClick={onCompare}
          aria-pressed={comparing}
          className="rounded-md px-2 py-1 text-xs text-ink-muted underline hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {s.compare}
        </button>
      </div>
    </li>
  );
}
