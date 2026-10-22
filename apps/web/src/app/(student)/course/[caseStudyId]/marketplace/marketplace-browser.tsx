"use client";

// The case-study marketplace's working surface (decision 0076): filter the
// catalogue, compare a few candidates, and build the quotation.
//
// The basket lives here as the quantities the student chose, and every price on
// screen comes back from the server's own pricing of it. That split is
// deliberate: the client may say what is wanted and never what it costs, so
// there is exactly one account of the money and it is the one the student will
// have to defend.
//
// The actions arrive already bound to the variant (the page binds them), so
// this component never handles the variant id itself; browsing and the line
// cards are shared with the project marketplace (decision 0100).
import { useCallback, useMemo, useState, useTransition } from "react";

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
import { CatalogueSection, LineCard, useCatalogue } from "../../../_marketplace/catalogue";
import { ComparisonTable } from "../../../_marketplace/comparison-table";
import { RfqPanel } from "../../../_marketplace/rfq-panel";
import { strings } from "../../../strings";
import { QuoteSheet } from "./quote-sheet";

const MAX_COMPARE = 5;

type Supplier = { id: string; name: string };

export function MarketplaceBrowser({
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
  categories: string[];
  suppliers: Supplier[];
  shortlist: LineSummary[];
  initialLines: LineList;
  initialQuote: Quote | null;
  browse: (query: LineQuery) => Promise<Result<LineList>>;
  compare: (skus: string[]) => Promise<Result<Comparison>>;
  save: (quoteId: number | null, lines: QuoteLine[]) => Promise<Result<Quote>>;
  issue: (quoteId: number) => Promise<Result<Quote>>;
  discard: (quoteId: number) => Promise<Result<void>>;
  ask: (request: RfqRequest) => Promise<Result<Rfq>>;
}) {
  const s = strings.marketplace;
  const catalogue = useCatalogue(initialLines, browse);

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
    for (const line of [...shortlist, ...catalogue.lines.items]) map[line.sku] = line.name;
    return map;
  }, [shortlist, catalogue.lines.items]);
  // The material tiles for the same columns (decision 0106), from the same
  // lines.
  const swatches = useMemo(() => {
    const map: Record<string, { swatch: string; category: string }> = {};
    for (const line of [...shortlist, ...catalogue.lines.items]) {
      map[line.sku] = { swatch: line.swatch, category: line.category };
    }
    return map;
  }, [shortlist, catalogue.lines.items]);

  const inBasket = useMemo(() => new Set(basket.map((line) => line.sku)), [basket]);

  // One path for every basket change: change the quantities, then let the
  // server price them and tell us what it did.
  const commit = useCallback(
    (next: QuoteLine[]) => {
      setBasket(next);
      startTransition(async () => {
        const result = await save(quote?.id ?? null, next);
        if (result.ok) {
          setQuote(result.data);
          setFailure(null);
        } else {
          setFailure(result.detail || s.offline);
        }
      });
    },
    [save, quote?.id, s.offline],
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
      const result = await compare(next);
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
      const result = await ask(request);
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
        <CatalogueSection
          catalogue={catalogue}
          suppliers={suppliers}
          categories={categories}
          relevanceLabel={s.sortRelevance}
          inBasket={inBasket}
          comparing={selected}
          onAdd={add}
          onCompare={toggleCompare}
        />

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
              commit(basket.map((line) => (line.sku === sku ? { ...line, quantity } : line)))
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
          swatches={swatches}
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

function fromQuote(quote: Quote | null): QuoteLine[] {
  if (!quote) return [];
  return quote.lines.map((line) => ({
    sku: line.sku,
    quantity: line.quantity,
    cut_to_length: line.cut_to_length,
    cut_count: line.cut_count,
  }));
}
