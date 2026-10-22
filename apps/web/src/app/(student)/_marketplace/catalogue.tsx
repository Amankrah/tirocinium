"use client";

// Browsing the catalogue, shared by both marketplaces (decisions 0076 and
// 0100, restyled in 0105): the filters, the sort, the grid of lines, and
// paging. Each surface supplies how it reaches the server (the case-study one
// prices against a variant, the project one at list prices) and what adding
// or comparing a line means to it; the browsing itself is the same.
//
// Filtering narrows and never restricts. Every line stays reachable however
// the filters are set, because deciding that a material is wrong is the
// exercise, and a catalogue that hid the wrong answers would be doing it for
// them. Filters refetch through the server rather than narrowing the page
// already held, because the catalogue is paginated and a client-side filter
// would quietly stop at the page boundary.
import { useCallback, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClassName } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import type { LineList, LineQuery, LineSummary, Result } from "@/lib/api/marketplace";
import { lead, money } from "@/lib/money";
import { MaterialSwatch } from "./material-swatch";
import { strings } from "../strings";

const PAGE = 24;

export const SELECT = inputClassName("py-2 text-sm");

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
    <section aria-labelledby="catalogue" className="flex flex-col gap-5">
      <h2 id="catalogue" className="font-display text-2xl">
        {s.title}
      </h2>

      <div className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_repeat(3,auto)]">
        <label className="relative flex items-center text-sm">
          <span className="sr-only">{s.search}</span>
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 text-ink-muted" />
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
            className={inputClassName("py-2 pl-9 text-sm")}
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
        <EmptyState icon="search" body={s.noResults} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
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
          <Button variant="secondary" onClick={loadMore} disabled={pending}>
            {s.more}
            <Icon name="chevron-down" size={14} />
          </Button>
        </div>
      ) : null}
    </section>
  );
}

// A catalogue line as a card, in the project marketplace's look (decision
// 0105): the supplier and SKU as the quiet eyebrow, the name in the display
// face, the price as the loudest figure, then the two verbs.
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
  const p = strings.project;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-rule-line bg-surface p-4 shadow-raised transition-[border-color,box-shadow] duration-(--motion-duration) ease-(--motion-ease) hover:border-ink hover:shadow-floating">
      <MaterialSwatch
        swatch={line.swatch}
        category={line.category}
        label={line.category}
        size="tile"
        className="-mx-4 -mt-4 w-auto rounded-t-lg rounded-b-none border-0 border-b border-rule-line"
      />
      <div className="flex flex-col gap-1">
        <span className="flex items-center justify-between gap-2 text-xs text-ink-muted">
          <span className="truncate">{line.supplier_name}</span>
          <span className="shrink-0 font-mono">{line.sku}</span>
        </span>
        <span className="font-display text-lg leading-snug text-ink">{line.name}</span>
        <span className="text-xs text-ink-muted">{line.spec}</span>
      </div>

      {line.tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1" aria-label={p.attributes}>
          {line.tags.slice(0, 3).map((tag) => (
            <li key={tag}>
              <Badge>{tag}</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto flex flex-col gap-0.5 border-t border-rule-line pt-3">
        <span className="font-mono text-base tabular-nums text-ink">
          {s.perUnit(money(line.price_cents), line.unit_label)}
        </span>
        {line.price_per_kg_cents !== null && line.unit !== "kg" ? (
          <span className="font-mono text-xs tabular-nums text-ink-muted">
            ≈ {s.perKilo(money(Math.round(line.price_per_kg_cents)))}
          </span>
        ) : null}
        <span className="mt-1 text-xs text-ink-muted">
          {s.minimumOrder(String(line.moq), line.unit_label)} · {line.stock_label} · {lead(line.lead_days)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onAdd} disabled={inBasket}>
          {inBasket ? <Icon name="check" size={14} /> : <Icon name="plus" size={14} />}
          {inBasket ? s.added : s.add}
        </Button>
        <button
          type="button"
          onClick={onCompare}
          aria-pressed={comparing}
          className={buttonClassName(
            comparing ? "secondary" : "quiet",
            comparing ? "border-accent/40 bg-accent-soft text-accent-text" : "text-ink-muted",
            "sm",
          )}
        >
          <Icon name="layers" size={14} />
          {s.compare}
        </button>
      </div>
    </li>
  );
}
