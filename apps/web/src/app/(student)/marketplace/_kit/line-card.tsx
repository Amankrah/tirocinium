import Link from "next/link";

import type { LineSummary } from "@/lib/api/marketplace";
import { lead, money } from "@/lib/money";
import { strings } from "../../strings";
import { LineActions } from "./controls";

// A catalogue line as a card on the project marketplace's pages (decision
// 0101). Server-rendered: everything a buyer compares on is HTML, and only the
// two verbs (add to quote, put in the comparison tray) are script.
export function LineCard({ line }: { line: LineSummary }) {
  const s = strings.marketplace;
  const p = strings.project;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-rule-line p-4">
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-xs text-ink-muted">
          {line.sku} · {line.supplier_name}
        </span>
        <Link
          href={`/marketplace/line/${encodeURIComponent(line.sku)}`}
          className="font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {line.name}
        </Link>
        <span className="text-xs text-ink-muted">{line.spec}</span>
      </div>

      {line.tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1" aria-label={p.attributes}>
          {line.tags.slice(0, 3).map((tag) => (
            <li key={tag} className="rounded border border-rule-line px-1.5 py-0.5 text-xs text-ink-muted">
              {tag}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-0.5 font-mono text-sm tabular-nums">
        <span>{s.perUnit(money(line.price_cents), line.unit_label)}</span>
        {line.price_per_kg_cents !== null && line.unit !== "kg" ? (
          <span className="text-xs text-ink-muted">
            ≈ {s.perKilo(money(Math.round(line.price_per_kg_cents)))}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5 text-xs text-ink-muted">
        <span>{s.minimumOrder(String(line.moq), line.unit_label)}</span>
        <span>
          {line.stock_label} · {lead(line.lead_days)}
        </span>
      </div>

      <div className="mt-auto pt-2">
        <LineActions line={{ sku: line.sku, moq: line.moq, name: line.name }} />
      </div>
    </li>
  );
}

export function LineGrid({ lines }: { lines: LineSummary[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {lines.map((line) => (
        <LineCard key={line.sku} line={line} />
      ))}
    </ul>
  );
}
