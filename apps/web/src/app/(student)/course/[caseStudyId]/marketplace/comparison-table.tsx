"use client";

// The side-by-side comparison (decision 0062). The server decides which cell in
// a row is best, and which rows have a best at all: "lower is better" is a
// property of the property, not of the layout, and a table that worked it out
// in the browser would be a second opinion.
//
// A best cell is marked in text as well as in weight, because a marking that
// exists only as boldness is a marking a screen reader cannot pass on.
import type { Comparison } from "@/lib/api/marketplace";
import { strings } from "../../../strings";

export function ComparisonTable({
  comparison,
  names,
  onClear,
}: {
  comparison: Comparison;
  names: Record<string, string>;
  onClear: () => void;
}) {
  const s = strings.marketplace;
  const sections: string[] = [];
  for (const row of comparison.rows) {
    if (!sections.includes(row.section)) sections.push(row.section);
  }

  return (
    <section aria-labelledby="comparison" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="comparison" className="font-display text-2xl">
          {s.comparing(comparison.skus.length)}
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="text-sm text-ink-muted underline hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {s.clearComparison}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule-line text-left">
              <th scope="col" className="py-2 pr-4 font-medium">
                <span className="sr-only">{s.compare}</span>
              </th>
              {comparison.skus.map((sku) => (
                <th key={sku} scope="col" className="py-2 pr-4 font-medium">
                  {names[sku] ?? sku}
                </th>
              ))}
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={comparison.skus.length + 1}
                  className="pt-5 pb-1 text-left text-xs font-medium uppercase tracking-wide text-ink-muted"
                >
                  {section}
                </th>
              </tr>
              {comparison.rows
                .filter((row) => row.section === section)
                .map((row) => (
                  <tr key={row.key} className="border-b border-rule-line/60">
                    <th scope="row" className="py-1.5 pr-4 text-left font-normal text-ink-muted">
                      {row.label}
                    </th>
                    {row.cells.map((cell) => (
                      <td
                        key={cell.sku}
                        className={`py-1.5 pr-4 font-mono tabular-nums ${
                          cell.best ? "font-medium text-ink" : ""
                        }`}
                      >
                        {cell.display}
                        {cell.best ? <span className="sr-only"> (best)</span> : null}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
