import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { LineSummary } from "@/lib/api/marketplace";
import { lead, money } from "@/lib/money";
import { ImpactMarks } from "../../_marketplace/impact-marks";
import { MaterialTile, PhotoCredit } from "../../_marketplace/material-tile";
import { strings } from "../../strings";
import { LineActions } from "./controls";

// A catalogue line as a card on the project marketplace's pages (decision
// 0101, restyled in 0105). Server-rendered: everything a buyer compares on is
// HTML, and only the two verbs (add to quote, put in the comparison tray) are
// script. The price is the card's loudest figure, because that is what a
// student scanning a grid is comparing; the supplier and SKU are the quiet
// eyebrow a report will cite.
export function LineCard({ line }: { line: LineSummary }) {
  const s = strings.marketplace;
  const p = strings.project;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-rule-line bg-surface p-4 shadow-raised transition-[border-color,box-shadow] duration-(--motion-duration) ease-(--motion-ease) hover:border-ink hover:shadow-floating">
      {/* The material as a picture (decision 0106), captioned with its
          category; the name beneath is what a reader is told. */}
      <Link
        href={`/marketplace/line/${encodeURIComponent(line.sku)}`}
        tabIndex={-1}
        aria-hidden="true"
        className="-mx-4 -mt-4 block"
      >
        {line.image ? (
          <span className="relative block h-28 overflow-hidden border-b border-rule-line bg-white">
            <Image
              src={line.image}
              alt=""
              fill
              sizes="(min-width: 1024px) 20rem, 50vw"
              className="object-contain"
            />
          </span>
        ) : (
          <MaterialTile
            swatch={line.swatch}
            category={line.category}
            label={line.category}
            size="tile"
            className="rounded-t-lg rounded-b-none border-0 border-b border-rule-line"
          />
        )}
      </Link>
      {line.image ? null : (
        <PhotoCredit swatch={line.swatch} className="truncate text-[0.65rem] text-ink-muted" />
      )}
      <div className="flex flex-col gap-1">
        <span className="flex items-center justify-between gap-2 text-xs text-ink-muted">
          <span className="truncate">{line.supplier_name}</span>
          <span className="shrink-0 font-mono">{line.sku}</span>
        </span>
        <Link
          href={`/marketplace/line/${encodeURIComponent(line.sku)}`}
          className="font-display text-lg leading-snug text-ink hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm"
        >
          {line.name}
        </Link>
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
        <ImpactMarks line={line} />
      </div>

      <LineActions line={{ sku: line.sku, moq: line.moq, name: line.name }} />
    </li>
  );
}

export function LineGrid({ lines }: { lines: LineSummary[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {lines.map((line) => (
        <LineCard key={line.sku} line={line} />
      ))}
    </ul>
  );
}
