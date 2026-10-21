"use client";

// The project marketplace's working surface (decision 0100): browse, compare,
// build a quotation, print it. The catalogue, the comparison and the request
// for quotation are the case-study marketplace's own components; what differs
// is that nothing is stored and the prices are list prices.
//
// The basket is held here as the quantities the student chose, and every
// figure comes back from the server's pricing of it, exactly as on a case
// study: the client says what is wanted and never what it costs. Because the
// server keeps nothing, the quotation lives only on this page, and printing it
// is how the student keeps it. The printed copy is a separate, fixed rendering
// of the same quotation (no inputs, no buttons), shown only to the printer.
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type {
  Comparison,
  LineList,
  LineQuery,
  LineSummary,
  ProjectQuotation,
  ProjectRfq,
  QuoteLine,
  Result,
  RfqRequest,
} from "@/lib/api/marketplace";
import { CatalogueSection, useCatalogue } from "../_marketplace/catalogue";
import { ComparisonTable } from "../_marketplace/comparison-table";
import { QuoteBody } from "../_marketplace/quote-body";
import { RfqPanel } from "../_marketplace/rfq-panel";
import { strings } from "../strings";

const MAX_COMPARE = 5;

const DAY = new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: "UTC" });

type Supplier = { id: string; name: string };

export function ProjectMarketplace({
  basis,
  categories,
  suppliers,
  initialLines,
  browse,
  compare,
  price,
  ask,
}: {
  basis: string;
  categories: string[];
  suppliers: Supplier[];
  initialLines: LineList;
  browse: (query: LineQuery) => Promise<Result<LineList>>;
  compare: (skus: string[]) => Promise<Result<Comparison>>;
  price: (lines: QuoteLine[]) => Promise<Result<ProjectQuotation>>;
  ask: (request: RfqRequest) => Promise<Result<ProjectRfq>>;
}) {
  const s = strings.marketplace;
  const p = strings.project;
  const catalogue = useCatalogue(initialLines, browse);

  const [basket, setBasket] = useState<QuoteLine[]>([]);
  const [quotation, setQuotation] = useState<ProjectQuotation | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [advice, setAdvice] = useState<ProjectRfq | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const names = useMemo(() => {
    const map: Record<string, string> = {};
    for (const line of catalogue.lines.items) map[line.sku] = line.name;
    return map;
  }, [catalogue.lines.items]);

  const inBasket = useMemo(() => new Set(basket.map((line) => line.sku)), [basket]);

  // One path for every basket change: change the quantities, then let the
  // server price them and say what it did (a quantity raised to a minimum
  // order comes back as a notice, never silently).
  function commit(next: QuoteLine[]) {
    setBasket(next);
    if (next.length === 0) {
      setQuotation(null);
      return;
    }
    startTransition(async () => {
      const result = await price(next);
      if (result.ok) {
        setQuotation(result.data);
        // The server may have raised a quantity; the basket follows what was
        // priced so the next change starts from the figure on screen.
        setBasket(
          result.data.lines.map((line) => ({
            sku: line.sku,
            quantity: line.quantity,
            cut_to_length: line.cut_to_length,
            cut_count: line.cut_count,
          })),
        );
        setFailure(null);
      } else {
        setFailure(result.detail || s.offline);
      }
    });
  }

  function add(line: LineSummary) {
    if (inBasket.has(line.sku)) return;
    commit([...basket, { sku: line.sku, quantity: line.moq, cut_to_length: false, cut_count: 1 }]);
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

  function onAsk(request: RfqRequest) {
    startTransition(async () => {
      const result = await ask(request);
      if (result.ok) setAdvice(result.data);
      else setFailure(result.detail || s.offline);
    });
  }

  const priced = quotation !== null && quotation.lines.length > 0;

  return (
    <>
      <div className="flex flex-col gap-10 print:hidden">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <CatalogueSection
            catalogue={catalogue}
            suppliers={suppliers}
            categories={categories}
            relevanceLabel={p.sortCatalogue}
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
            <aside
              aria-labelledby="quotation-heading"
              aria-busy={pending}
              className="flex flex-col gap-4 rounded-lg border border-rule-line p-4"
            >
              <header className="flex flex-col gap-1">
                <h2 id="quotation-heading" className="font-display text-xl">
                  {p.quotation}
                </h2>
                {priced && quotation.reference ? (
                  <p className="font-mono text-xs tabular-nums text-ink-muted">
                    {quotation.reference}
                  </p>
                ) : null}
              </header>

              {priced ? (
                <>
                  <QuoteBody
                    // Keyed on the reference so the quantity inputs, which
                    // hold what was typed, reset to what the server priced.
                    key={quotation.reference}
                    lines={quotation.lines}
                    totals={quotation.totals}
                    notices={quotation.notices}
                    editable
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
                  />
                  <p className="text-xs text-ink-muted">{p.notSaved}</p>
                  <div className="flex flex-wrap items-center gap-3 border-t border-rule-line pt-3">
                    <Button onClick={() => window.print()} disabled={pending}>
                      {pending ? p.pricing : p.print}
                    </Button>
                    <Button variant="quiet" onClick={() => commit([])} disabled={pending}>
                      {p.clear}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-muted">{s.quote.empty}</p>
              )}
            </aside>
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

      {priced ? <PrintedQuotation quotation={quotation} basis={basis} /> : null}
    </>
  );
}

// What reaches paper: the reference, the dates, the basis the prices were
// struck on, and the lines and totals fixed. Hidden on screen, where the
// editable sheet above is the same quotation.
function PrintedQuotation({ quotation, basis }: { quotation: ProjectQuotation; basis: string }) {
  const p = strings.project;
  return (
    <article className="hidden flex-col gap-4 text-ink print:flex">
      <header className="flex flex-col gap-1 border-b border-rule-line pb-3">
        <h1 className="font-display text-2xl">
          {quotation.reference ? p.reference(quotation.reference) : p.quotation}
        </h1>
        <p className="font-mono text-xs tabular-nums">
          {p.prepared(DAY.format(new Date(quotation.prepared_at * 1000)))} ·{" "}
          {p.validUntil(DAY.format(new Date(quotation.valid_until * 1000)))}
        </p>
        <p className="text-xs">{basis}</p>
      </header>
      <QuoteBody
        lines={quotation.lines}
        totals={quotation.totals}
        notices={quotation.notices}
        editable={false}
      />
      <p className="border-t border-rule-line pt-3 text-xs">{p.printedNote}</p>
    </article>
  );
}
