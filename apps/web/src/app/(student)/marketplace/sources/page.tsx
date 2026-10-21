import Link from "next/link";

import { getProjectMarketplace } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../strings";
import { CONTENT_CATALOGUE, SOURCES } from "../_kit/content";

// Where the prices come from (decision 0101): the published data each part of
// the catalogue is anchored to, so a student can cite the marketplace or go
// past it to the market data. It belongs to one catalogue and says nothing for
// any other rather than vouching for figures it did not source.
export default async function SourcesPage() {
  const { token } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const front = await getProjectMarketplace(token);
  if (!front.ok) throw new Error(s.offline);
  const ours = front.data.catalogue_id === CONTENT_CATALOGUE;
  const th = "border-b border-rule-line py-2 pr-4 text-left text-xs font-medium text-ink-muted";
  const td = "border-b border-rule-line/60 py-2 pr-4 align-top";

  return (
    <>
      <nav aria-label={p.breadcrumb} className="text-sm text-ink-muted">
        <Link href="/marketplace" className="underline hover:text-ink">
          {p.home}
        </Link>{" "}
        › {p.sources}
      </nav>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl">{SOURCES.title}</h1>
        <p className="max-w-[var(--measure-reading)] text-ink-muted">
          {ours ? SOURCES.lede : front.data.course_note}
        </p>
      </header>
      {ours ? (
        <>
          <p className="max-w-[var(--measure-reading)] rounded-lg border border-rule-line p-4 text-sm">
            {SOURCES.notice}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {SOURCES.columns.map((column) => (
                    <th key={column} scope="col" className={th}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SOURCES.rows.map(([area, anchor, source, site]) => (
                  <tr key={area}>
                    <th scope="row" className={`${td} font-medium`}>
                      {area}
                    </th>
                    <td className={td}>{anchor}</td>
                    <td className={td}>
                      {source}
                      <span className="block font-mono text-xs text-ink-muted">{site}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section aria-labelledby="property-data" className="flex flex-col gap-2 rounded-lg border border-rule-line p-5">
            <h2 id="property-data" className="font-display text-xl">
              {SOURCES.propertiesHeading}
            </h2>
            <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">{SOURCES.properties}</p>
          </section>
        </>
      ) : null}
    </>
  );
}
