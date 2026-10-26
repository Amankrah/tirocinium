"use client";

// The comparison (decision 0101, restyled in 0105): the lines in the tray,
// side by side on every row the catalogue carries, with the server marking
// the best cell of each row on that criterion alone. No line wins every row,
// and the copy says so. From here the whole set can go into the quote, print,
// or be copied as a table.
import { useEffect, useState, useTransition } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { Comparison, LineList, LineQuery, Result } from "@/lib/api/marketplace";
import { ComparisonTable } from "../../_marketplace/comparison-table";
import { strings } from "../../strings";
import { useMarket } from "./market-state";

export function CompareView({
  compare,
  browse,
}: {
  compare: (skus: string[]) => Promise<Result<Comparison>>;
  browse: (query: LineQuery) => Promise<Result<LineList>>;
}) {
  const s = strings.marketplace;
  const p = strings.project;
  const market = useMarket();
  const { tray } = market;
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [lines, setLines] = useState<LineList | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const key = tray.join(",");

  useEffect(() => {
    if (tray.length === 0) {
      setComparison(null);
      setLines(null);
      return;
    }
    const skus = key.split(",");
    startTransition(async () => {
      const [table, found] = await Promise.all([
        compare(skus),
        browse({ sku: skus, limit: skus.length }),
      ]);
      if (table.ok && found.ok) {
        setComparison(table.data);
        setLines(found.data);
        setFailure(null);
      } else {
        setFailure(s.offline);
      }
    });
    // `key` stands for the tray's contents; the actions are stable server
    // references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (tray.length === 0) {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="font-display text-4xl leading-[1.05]">{p.compareTitle}</h1>
        <EmptyState
          icon="layers"
          body={p.compareEmpty}
          action={
            <ButtonLink href="/marketplace">
              {p.home}
              <Icon name="arrow-right" size={16} />
            </ButtonLink>
          }
        />
      </section>
    );
  }

  const names: Record<string, string> = {};
  const swatches: Record<string, { swatch: string; category: string; image?: string | null }> = {};
  for (const line of lines?.items ?? []) {
    names[line.sku] = line.name;
    swatches[line.sku] = {
      swatch: line.swatch,
      category: line.category,
      image: line.image,
    };
  }

  async function copy(table: Comparison) {
    try {
      await navigator.clipboard.writeText(comparisonAsTable(table, names));
      setCopied(p.copiedComparison);
    } catch {
      setCopied(p.copyBlocked);
    }
  }

  return (
    <section aria-busy={pending} className="flex flex-col gap-6">
      <h1 className="font-display text-4xl leading-[1.05]">{p.compareHeading(tray.length)}</h1>
      <Card as="div" tone="sunken" className="max-w-[var(--measure-reading)] text-sm leading-relaxed">
        {p.compareNotice}
      </Card>
      {failure ? (
        <p role="alert" className="text-sm text-flag-amber">
          {failure}
        </p>
      ) : null}
      {comparison ? (
        <ComparisonTable
          comparison={comparison}
          names={names}
          swatches={swatches}
          onClear={market.clearTray}
        />
      ) : (
        <p className="text-sm text-ink-muted">{s.comparing(tray.length)}</p>
      )}
      <Card
        as="div"
        tone="sunken"
        className="max-w-[var(--measure-reading)] text-sm leading-relaxed text-ink-muted"
      >
        {p.indicesReading}
      </Card>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button
          onClick={() =>
            market.addMany(
              (lines?.items ?? []).map((line) => ({ sku: line.sku, moq: line.moq, name: line.name })),
            )
          }
          disabled={!lines || pending}
        >
          <Icon name="plus" size={14} />
          {p.addAllToQuote(tray.length)}
        </Button>
        <Button variant="secondary" onClick={() => window.print()} disabled={!comparison}>
          <Icon name="print" size={14} />
          {p.printComparison}
        </Button>
        <Button variant="quiet" onClick={() => comparison && copy(comparison)} disabled={!comparison}>
          {p.copyTable}
        </Button>
        <p role="status" className="text-sm text-ink-muted">
          {copied}
        </p>
      </div>
    </section>
  );
}

/** The comparison as tab-separated text: one column per line, one row per
 * property, the best cell of a row marked in words. */
export function comparisonAsTable(table: Comparison, names: Record<string, string>): string {
  const p = strings.project;
  const header = [p.property, ...table.skus.map((sku) => `${names[sku] ?? sku} (${sku})`)];
  const rows = table.rows.map((row) => [
    row.label,
    ...row.cells.map((cell) =>
      `${cell.display.replace(/★/g, "*").replace(/☆/g, "")}${cell.best ? ` ${p.bestMark}` : ""}`,
    ),
  ]);
  return [header, ...rows].map((row) => row.join("\t")).join("\n");
}
