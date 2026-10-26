"use client";

// The side-by-side comparison (decision 0076, restyled in 0105). The server
// decides which cell in a row is best, and which rows have a best at all:
// "lower is better" is a property of the property, not of the layout, and a
// table that worked it out in the browser would be a second opinion.
//
// A best cell is marked in words, visibly, as well as in weight: boldness
// alone is a marking a screen reader cannot pass on and, on a monospaced
// figure, one a sighted reader barely sees (decision 0101).
import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Comparison } from "@/lib/api/marketplace";
import { MaterialTile, PhotoCredit } from "./material-tile";
import { strings } from "../strings";

function ColumnPicture({
  tile,
}: {
  tile?: { swatch: string; category: string; image?: string | null };
}) {
  if (tile?.image) {
    return (
      <span className="relative mb-2 block h-9 min-w-24 overflow-hidden rounded bg-white">
        <Image src={tile.image} alt="" fill sizes="6rem" className="object-contain" />
      </span>
    );
  }
  if (!tile) return null;
  return (
    <>
      <MaterialTile swatch={tile.swatch} category={tile.category} size="thumb" className="mb-2 min-w-24" />
      <PhotoCredit swatch={tile.swatch} className="sr-only" />
    </>
  );
}

export function ComparisonTable({
  comparison,
  names,
  swatches = {},
  onClear,
}: {
  comparison: Comparison;
  names: Record<string, string>;
  // The material tile above each column, when the surface knows it
  // (decision 0106); a column without one is just its name.
  swatches?: Record<string, { swatch: string; category: string; image?: string | null }>;
  onClear: () => void;
}) {
  const s = strings.marketplace;
  const sections: string[] = [];
  for (const row of comparison.rows) {
    if (!sections.includes(row.section)) sections.push(row.section);
  }

  return (
    <section aria-labelledby="comparison" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="comparison" className="font-display text-2xl">
          {s.comparing(comparison.skus.length)}
        </h2>
        <Button variant="quiet" size="sm" className="text-ink-muted print:hidden" onClick={onClear}>
          {s.clearComparison}
        </Button>
      </div>

      <div tabIndex={0} className="focus-ring overflow-x-auto rounded-lg border border-rule-line bg-surface print:rounded-none print:border-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="border-b border-rule-line px-3.5 py-3 text-start">
                <span className="sr-only">{s.compare}</span>
              </th>
              {comparison.skus.map((sku) => (
                <th
                  key={sku}
                  scope="col"
                  className="border-b border-rule-line px-3.5 py-3 text-start align-bottom font-display text-base font-normal leading-snug"
                >
                  <ColumnPicture tile={swatches[sku]} />
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
                  className="border-y border-rule-line bg-surface-sunken/60 px-3.5 py-2 text-start text-xs font-medium tracking-wide text-ink-muted uppercase"
                >
                  {section}
                </th>
              </tr>
              {comparison.rows
                .filter((row) => row.section === section)
                .map((row) => (
                  <tr
                    key={row.key}
                    className="transition-colors duration-(--motion-duration) ease-(--motion-ease) hover:bg-surface-sunken/40"
                  >
                    <th
                      scope="row"
                      className="border-b border-rule-line/60 px-3.5 py-2.5 text-start align-top font-normal text-ink-muted"
                    >
                      {row.label}
                    </th>
                    {row.cells.map((cell) => (
                      <td
                        key={cell.sku}
                        className={`border-b border-rule-line/60 px-3.5 py-2.5 align-top font-mono tabular-nums ${
                          cell.best ? "font-semibold text-ink" : ""
                        }`}
                      >
                        {cell.display}
                        {cell.best ? (
                          <Badge tone="accent" className="ml-2 align-middle font-sans">
                            {s.best}
                          </Badge>
                        ) : null}
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
