"use client";

// The marketplace's working surface (decision 0062): filter the catalogue,
// compare a few candidates, and build the quotation.
//
// The basket lives here as the quantities the student chose, and every price on
// screen comes back from the server's own pricing of it. That split is
// deliberate: the client may say what is wanted and never what it costs, so
// there is exactly one account of the money and it is the one the student will
// have to defend.
//
// Filtering narrows and never restricts. Every line stays reachable however the
// filters are set, because deciding that a material is wrong is the exercise,
// and a catalogue that hid the wrong answers would be doing it for them.
import { useCallback, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type {
  Comparison,
  LineList,
  LineQuery,
  LineSummary,
  Quote,
  QuoteLine,
  Result,
  Rfq,
  RfqRequest,
} from "@/lib/api/marketplace";
import { lead, money } from "@/lib/money";
import { strings } from "../../../strings";
import { ComparisonTable } from "./comparison-table";
import { QuoteSheet } from "./quote-sheet";
import { RfqPanel } from "./rfq-panel";

const MAX_COMPARE = 5;

const SORTS = [
  ["relevance", strings.marketplace.sortRelevance],
  ["price_asc", strings.marketplace.sortPriceAsc],
  ["price_desc", strings.marketplace.sortPriceDesc],
  ["lead", strings.marketplace.sortLead],
  ["name", strings.marketplace.sortName],
] as const;

type Supplier = { id: string; name: string };

export function MarketplaceBrowser({
  variantId,
  categories,
  suppliers,
  shortlist,
  initialLines,
  initialQuote,
  browse,
  compare,
  save,
  issue,
  discard,
  ask,
}: {
  variantId: number;
  caseStudyId: number;
  categories: string[];
  suppliers: Supplier[];
  shortlist: LineSummary[];
  initialLines: LineList;
  initialQuote: Quote | null;
  validityDays: number;
  browse: (variantId: number, query: LineQuery) => Promise<Result<LineList>>;
  compare: (variantId: number, skus: string[]) => Promise<Result<Comparison>>;
  save: (
    variantId: number,
    quoteId: number | null,
    lines: QuoteLine[],
  ) => Promise<Result<Quote>>;
  issue: (quoteId: number) => Promise<Result<Quote>>;
  discard: (quoteId: number) => Promise<Result<void>>;
  ask: (variantId: number, request: RfqRequest) => Promise<Result<Rfq>>;
}) {
  const s = strings.marketplace;

  const [lines, setLines] = useState<LineList>(initialLines);
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<string>("relevance");

  const [quote, setQuote] = useState<Quote | null>(initialQuote);
  const [basket, setBasket] = useState<QuoteLine[]>(() => fromQuote(initialQuote));

  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [advice, setAdvice] = useState<Rfq | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Names for the comparison header, drawn from whatever the student has seen:
  // the shortlist and the current page both carry them, and a SKU that is in
  // neither falls back to itself rather than to a fetch.
  const names = useMemo(() => {
    const map: Record<string, string> = {};
    for (const line of [...shortlist, ...lines.items]) map[line.sku] = line.name;
    return map;
  }, [shortlist, lines.items]);

  const inBasket = useMemo(
    () => new Set(basket.map((line) => line.sku)),
    [basket],
  );

  const query = useCallback(
    (cursor: number): LineQuery => ({
      supplier: supplier || null,
      category: category || null,
      q: search || null,
      sort,
      cursor,
      limit: 24,
    }),
    [supplier, category, search, sort],
  );

  const refilter = useCallback(
    (next: Partial<{ search: string; supplier: string; category: string; sort: string }>) => {
      const merged = {
        supplier: next.supplier ?? supplier,
        category: next.category ?? category,
        q: next.search ?? search,
        sort: next.sort ?? sort,
        cursor: 0,
        limit: 24,
      };
      startTransition(async () => {
        const result = await browse(variantId, {
          ...merged,
          supplier: merged.supplier || null,
          category: merged.category || null,
          q: merged.q || null,
        });
        if (result.ok) setLines(result.data);
      });
    },
    [browse, variantId, supplier, category, search, sort],
  );

  function loadMore() {
    if (lines.next_cursor === null) return;
    const cursor = lines.next_cursor;
    startTransition(async () => {
      const result = await browse(variantId, query(cursor));
      if (result.ok) {
        setLines((current) => ({
          items: [...current.items, ...result.data.items],
          next_cursor: result.data.next_cursor,
          total: result.data.total,
        }));
      }
    });
  }

  // One path for every basket change: change the quantities, then let the
  // server price them and tell us what it did.
  const commit = useCallback(
    (next: QuoteLine[]) => {
      setBasket(next);
      startTransition(async () => {
        const result = await save(variantId, quote?.id ?? null, next);
        if (result.ok) {
          setQuote(result.data);
          setFailure(null);
        } else {
          setFailure(result.detail || s.offline);
        }
      });
    },
    [save, variantId, quote?.id, s.offline],
  );

  function add(line: LineSummary) {
    if (inBasket.has(line.sku)) return;
    commit([
      ...basket,
      { sku: line.sku, quantity: line.moq, cut_to_length: false, cut_count: 1 },
    ]);
  }

  function toggleCompare(sku: string) {
    const next = selected.includes(sku)
      ? selected.filter((item) => item !== sku)
      : selected.length >= MAX_COMPARE
        ? selected
        : [...selected, sku];
    setSelected(next);
    if (next.length < 2) {
      setComparison(null);
      return;
    }
    startTransition(async () => {
      const result = await compare(variantId, next);
      if (result.ok) setComparison(result.data);
    });
  }

  function onIssue() {
    if (!quote) return;
    const id = quote.id;
    startTransition(async () => {
      const result = await issue(id);
      if (result.ok) {
        setQuote(result.data);
        setFailure(null);
      } else {
        setFailure(result.detail || s.offline);
      }
    });
  }

  function onDiscard() {
    if (!quote) return;
    const id = quote.id;
    startTransition(async () => {
      const result = await discard(id);
      if (result.ok) {
        setQuote(null);
        setBasket([]);
        setFailure(null);
      } else {
        setFailure(result.detail || s.offline);
      }
    });
  }

  function startAnother() {
    setQuote(null);
    setBasket([]);
    setFailure(null);
  }

  function onAsk(request: RfqRequest) {
    startTransition(async () => {
      const result = await ask(variantId, request);
      if (result.ok) setAdvice(result.data);
      else setFailure(result.detail || s.offline);
    });
  }

  return (
    <div className="flex flex-col gap-10">
      {shortlist.length > 0 ? (
        <section aria-labelledby="shortlist" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="shortlist" className="font-display text-2xl">
              {s.shortlist}
            </h2>
            <p className="text-sm text-ink-muted">{s.shortlistHint}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shortlist.map((line) => (
              <LineCard
                key={line.sku}
                line={line}
                inBasket={inBasket.has(line.sku)}
                comparing={selected.includes(line.sku)}
                onAdd={() => add(line)}
                onCompare={() => toggleCompare(line.sku)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
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
              onChange={(event) => {
                setSupplier(event.currentTarget.value);
                refilter({ supplier: event.currentTarget.value });
              }}
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
              onChange={(event) => {
                setCategory(event.currentTarget.value);
                refilter({ category: event.currentTarget.value });
              }}
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
              onChange={(event) => {
                setSort(event.currentTarget.value);
                refilter({ sort: event.currentTarget.value });
              }}
              className={SELECT}
            >
              {SORTS.map(([value, label]) => (
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
                  comparing={selected.includes(line.sku)}
                  onAdd={() => add(line)}
                  onCompare={() => toggleCompare(line.sku)}
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

        <div className="flex flex-col gap-4">
          {failure ? (
            <p role="alert" className="text-sm text-flag-amber">
              {failure}
            </p>
          ) : null}
          <QuoteSheet
            quote={quote}
            pending={pending}
            onQuantity={(sku, quantity) =>
              commit(
                basket.map((line) =>
                  line.sku === sku ? { ...line, quantity } : line,
                ),
              )
            }
            onCut={(sku, cutToLength) =>
              commit(
                basket.map((line) =>
                  line.sku === sku ? { ...line, cut_to_length: cutToLength } : line,
                ),
              )
            }
            onRemove={(sku) => commit(basket.filter((line) => line.sku !== sku))}
            onIssue={onIssue}
            onDiscard={onDiscard}
            onStartAnother={startAnother}
          />
        </div>
      </div>

      {comparison ? (
        <ComparisonTable
          comparison={comparison}
          names={names}
          onClear={() => {
            setSelected([]);
            setComparison(null);
          }}
        />
      ) : null}

      <RfqPanel
        sku={selected[0] ?? basket[0]?.sku ?? null}
        pending={pending}
        answer={advice}
        onSend={onAsk}
      />
    </div>
  );
}

const SELECT =
  "rounded-md border border-rule-line bg-transparent px-3 py-2 text-sm " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function fromQuote(quote: Quote | null): QuoteLine[] {
  if (!quote) return [];
  return quote.lines.map((line) => ({
    sku: line.sku,
    quantity: line.quantity,
    cut_to_length: line.cut_to_length,
    cut_count: line.cut_count,
  }));
}

function LineCard({
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
