import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { getProjectMarketplace, listProjectLines } from "@/lib/api/marketplace";
import { money } from "@/lib/money";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../strings";
import { CONTENT_CATALOGUE, FEATURED, PRESETS } from "./_kit/content";
import { CompareSet } from "./_kit/controls";
import { LineGrid } from "./_kit/line-card";
import { PROPERTY_COUNT } from "./_kit/properties";

// The project marketplace's front page (decisions 0100 and 0101, restyled in
// 0105): what it is for, who trades here, the lines projects most often start
// from, and three comparisons worth making before committing.
// Server-rendered; the preset comparisons are the only script.
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
      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
        <div className="flex flex-col gap-5">
          <h1 className="max-w-[20ch] font-display text-4xl leading-[1.05] sm:text-5xl">{p.title}</h1>
          <p className="max-w-[var(--measure-reading)] text-pretty text-ink-muted">{p.lede}</p>
          <p className="flex max-w-[var(--measure-reading)] items-start gap-2 text-sm text-ink-muted">
            <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
            {p.notSaved}
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/marketplace/briefs">
              {p.startFromBrief}
              <Icon name="arrow-right" size={16} />
            </ButtonLink>
            <ButtonLink href="/marketplace/guide" variant="secondary">
              {p.guideLink}
            </ButtonLink>
          </div>
        </div>
        <Card as="div" tone="flat" padded={false} className="divide-y divide-rule-line">
          <dl className="grid grid-cols-2">
            {[
              [String(lineCount), p.kpiLines],
              [String(market.suppliers.length), p.kpiSuppliers],
              [String(market.briefs.length), p.kpiBriefs],
              [String(PROPERTY_COUNT), p.kpiProperties],
            ].map(([value, label], i) => (
              <div
                key={label}
                className={
                  "flex flex-col gap-0.5 p-4 " +
                  (i % 2 === 0 ? "border-r border-rule-line " : "") +
                  (i < 2 ? "border-b border-rule-line" : "")
                }
              >
                <dt className="order-2 text-xs text-ink-muted">{label}</dt>
                <dd className="order-1 font-display text-3xl tabular-nums leading-none">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="px-4 py-2.5 font-mono text-xs text-ink-muted">
            {p.basis(market.title, market.catalogue_version)}
          </p>
        </Card>
      </header>

      <section aria-labelledby="suppliers" className="flex flex-col gap-5">
        <SectionHeading id="suppliers" title={p.directory} description={p.directoryLede} />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {market.suppliers.map(({ supplier, line_count, from_price_cents }) => (
            <Card
              key={supplier.id}
              as="li"
              padded={false}
              className="transition-[border-color,box-shadow] duration-(--motion-duration) ease-(--motion-ease) hover:border-ink hover:shadow-floating"
            >
              <div className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-sunken font-display text-xl leading-none"
                  >
                    {supplier.glyph}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <Link
                      href={`/marketplace/store/${supplier.id}`}
                      className="font-display text-xl leading-snug hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm"
                    >
                      {supplier.name}
                    </Link>
                    <span className="text-sm text-ink-muted">{supplier.tagline}</span>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-ink-muted">{supplier.blurb}</p>
                <ul className="flex flex-wrap gap-1" aria-label={p.categories}>
                  {supplier.categories.map((category) => (
                    <li key={category}>
                      <Badge>{category}</Badge>
                    </li>
                  ))}
                </ul>
                <p className="mt-auto flex flex-wrap gap-x-3 border-t border-rule-line pt-3 font-mono text-xs tabular-nums text-ink-muted">
                  <span>{s.supplierLines(line_count)}</span>
                  <span>{s.fromPrice(money(from_price_cents))}</span>
                  <span>{supplier.city}</span>
                </p>
              </div>
            </Card>
          ))}
        </ul>
      </section>

      {featured?.ok && featured.data.items.length > 0 ? (
        <section aria-labelledby="featured" className="flex flex-col gap-5">
          <SectionHeading id="featured" title={p.featured} />
          <LineGrid lines={featured.data.items} />
        </section>
      ) : null}

      {editorial ? (
        <Card as="section" tone="sunken" aria-labelledby="presets" className="flex flex-col gap-5">
          <h2 id="presets" className="font-display text-2xl">
            {p.presets}
          </h2>
          <ul className="grid gap-6 sm:grid-cols-3">
            {PRESETS.map((preset) => (
              <li key={preset.title} className="flex flex-col gap-2">
                <h3 className="font-display text-lg">{preset.title}</h3>
                <p className="text-sm leading-relaxed text-ink-muted">{preset.body}</p>
                <div className="mt-auto pt-1">
                  <CompareSet skus={preset.skus} label={p.comparePreset(preset.skus.length)} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
