import Link from "next/link";

import { buttonClassName } from "@/components/ui/button";
import { getProjectMarketplace, listProjectLines } from "@/lib/api/marketplace";
import { money } from "@/lib/money";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../strings";
import { CONTENT_CATALOGUE, FEATURED, PRESETS } from "./_kit/content";
import { CompareSet } from "./_kit/controls";
import { LineGrid } from "./_kit/line-card";
import { PROPERTY_COUNT } from "./_kit/properties";

// The project marketplace's front page (decisions 0100 and 0101): what it is
// for, who trades here, the lines projects most often start from, and three
// comparisons worth making before committing. Server-rendered; the preset
// comparisons are the only script.
export default async function MarketplaceHome() {
  const { token } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const front = await getProjectMarketplace(token);
  if (!front.ok) throw new Error(s.offline);
  const market = front.data;
  const editorial = market.catalogue_id === CONTENT_CATALOGUE;
  const featured = editorial
    ? await listProjectLines(token, { sku: FEATURED, limit: FEATURED.length })
    : null;
  const lineCount = market.suppliers.reduce((sum, entry) => sum + entry.line_count, 0);

  return (
    <>
      <header className="flex flex-col gap-4">
        <h1 className="max-w-[24ch] font-display text-4xl">{p.title}</h1>
        <p className="max-w-[var(--measure-reading)] text-ink-muted">{p.lede}</p>
        <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">{p.notSaved}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/marketplace/briefs" className={buttonClassName("primary")}>
            {p.startFromBrief}
          </Link>
          <Link href="/marketplace/guide" className={buttonClassName("quiet")}>
            {p.guideLink}
          </Link>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            [String(lineCount), p.kpiLines],
            [String(market.suppliers.length), p.kpiSuppliers],
            [String(market.briefs.length), p.kpiBriefs],
            [String(PROPERTY_COUNT), p.kpiProperties],
          ].map(([value, label]) => (
            <div key={label} className="flex flex-col gap-0.5 border-l border-rule-line pl-3">
              <dt className="order-2 text-xs text-ink-muted">{label}</dt>
              <dd className="order-1 font-display text-2xl tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="font-mono text-xs text-ink-muted">
          {p.basis(market.title, market.catalogue_version)}
        </p>
      </header>

      <section aria-labelledby="suppliers" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="suppliers" className="font-display text-2xl">
            {p.directory}
          </h2>
          <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">{p.directoryLede}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {market.suppliers.map(({ supplier, line_count, from_price_cents }) => (
            <li key={supplier.id} className="flex flex-col gap-2 rounded-lg border border-rule-line p-4">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="font-display text-2xl leading-none">
                  {supplier.glyph}
                </span>
                <div className="flex flex-col">
                  <Link
                    href={`/marketplace/store/${supplier.id}`}
                    className="font-display text-lg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {supplier.name}
                  </Link>
                  <span className="text-sm text-ink-muted">{supplier.tagline}</span>
                </div>
              </div>
              <p className="text-sm text-ink-muted">{supplier.blurb}</p>
              <ul className="flex flex-wrap gap-1" aria-label={p.categories}>
                {supplier.categories.map((category) => (
                  <li key={category} className="rounded border border-rule-line px-1.5 py-0.5 text-xs text-ink-muted">
                    {category}
                  </li>
                ))}
              </ul>
              <p className="mt-auto font-mono text-xs tabular-nums text-ink-muted">
                {s.supplierLines(line_count)} · {s.fromPrice(money(from_price_cents))} ·{" "}
                {supplier.city}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {featured?.ok && featured.data.items.length > 0 ? (
        <section aria-labelledby="featured" className="flex flex-col gap-4">
          <h2 id="featured" className="font-display text-2xl">
            {p.featured}
          </h2>
          <LineGrid lines={featured.data.items} />
        </section>
      ) : null}

      {editorial ? (
        <section aria-labelledby="presets" className="flex flex-col gap-4 rounded-lg border border-rule-line p-5">
          <h2 id="presets" className="font-display text-2xl">
            {p.presets}
          </h2>
          <ul className="grid gap-6 sm:grid-cols-3">
            {PRESETS.map((preset) => (
              <li key={preset.title} className="flex flex-col gap-2">
                <h3 className="font-medium">{preset.title}</h3>
                <p className="text-sm text-ink-muted">{preset.body}</p>
                <div className="mt-auto">
                  <CompareSet skus={preset.skus} label={p.comparePreset(preset.skus.length)} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
