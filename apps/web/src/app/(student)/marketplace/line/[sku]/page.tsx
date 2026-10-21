import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonClassName } from "@/components/ui/button";
import { getProjectLine } from "@/lib/api/marketplace";
import { lead, money } from "@/lib/money";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../../strings";
import { LineActions } from "../../_kit/controls";
import { LineGrid } from "../../_kit/line-card";
import { dataSheet } from "../../_kit/properties";

// One line in full (decision 0101): what it costs and on what terms, the
// price ladder, what it is, how it is made into a part, its data sheet and the
// derived indices a selection is argued on. The indices come from the server,
// from the same functions the comparison uses, so the two can never disagree.
export default async function LinePage({ params }: { params: Promise<{ sku: string }> }) {
  const { token } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const { sku } = await params;

  const result = await getProjectLine(token, decodeURIComponent(sku));
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error(s.offline);
  }
  const line = result.data;
  const sheet = dataSheet(line.properties, line.service);
  const { indices } = line;
  const perLitre =
    line.unit === "kg" && indices.cost_per_litre_cents !== null ? indices.cost_per_litre_cents : null;

  return (
    <>
      <nav aria-label={p.breadcrumb} className="text-sm text-ink-muted">
        <Link href="/marketplace" className="underline hover:text-ink">
          {p.home}
        </Link>{" "}
        ›{" "}
        <Link href={`/marketplace/store/${line.supplier_id}`} className="underline hover:text-ink">
          {line.supplier_name}
        </Link>{" "}
        › {line.category} › <span className="font-mono">{line.sku}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside aria-label={p.buy} className="flex flex-col gap-3 self-start rounded-lg border border-rule-line p-4">
          <p className="font-mono text-2xl tabular-nums">
            {money(line.price_cents)}
            <span className="text-sm text-ink-muted"> / {line.unit_label}</span>
          </p>
          {line.price_per_kg_cents !== null && line.unit !== "kg" ? (
            <p className="text-xs text-ink-muted">
              {p.perKgDetail(money(Math.round(line.price_per_kg_cents)), String(line.kg_per_unit), line.unit_label)}
            </p>
          ) : null}
          {perLitre !== null ? (
            <p className="text-xs text-ink-muted">{p.perLitre(money(Math.round(perLitre)))}</p>
          ) : null}
          <div className="flex flex-col gap-0.5 border-t border-rule-line pt-3 text-sm">
            <span>
              {line.stock_label} · {p.ships(lead(line.lead_days))}
            </span>
            <span className="text-ink-muted">
              {s.minimumOrder(String(line.moq), line.unit_label)}
              {line.cut_fee_cents > 0 ? ` · ${p.cutFee(money(line.cut_fee_cents))}` : ""}
            </span>
          </div>
          {line.price_breaks.length > 0 ? (
            <table className="w-full text-sm">
              <caption className="pb-1 text-left text-xs text-ink-muted">{p.breaks}</caption>
              <thead>
                <tr className="border-b border-rule-line text-left text-xs text-ink-muted">
                  <th scope="col" className="py-1 font-normal">
                    {p.orderAtLeast}
                  </th>
                  <th scope="col" className="py-1 text-right font-normal">
                    {p.unitPrice}
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {line.price_breaks.map(([quantity, percent]) => (
                  <tr key={quantity} className="border-b border-rule-line/60">
                    <td className="py-1">
                      {quantity} {line.unit_label}
                    </td>
                    <td className="py-1 text-right">
                      {money(Math.round(line.price_cents * (1 - percent / 100)))}{" "}
                      <span className="text-ink-muted">−{percent} %</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <LineActions line={{ sku: line.sku, moq: line.moq, name: line.name }} size="full" />
          <Link
            href={`/marketplace/request?sku=${encodeURIComponent(line.sku)}`}
            className={buttonClassName("quiet", "text-sm")}
          >
            {p.askAboutLine}
          </Link>
        </aside>

        <article className="flex flex-col gap-4">
          <header className="flex flex-col gap-1">
            <p className="text-sm text-ink-muted">{line.supplier_name}</p>
            <h1 className="font-display text-3xl">{line.name}</h1>
            <p className="font-mono text-xs text-ink-muted">
              {line.sku} · {line.spec}
            </p>
          </header>
          {line.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1" aria-label={p.attributes}>
              {line.tags.map((tag) => (
                <li key={tag} className="rounded border border-rule-line px-1.5 py-0.5 text-xs text-ink-muted">
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="max-w-[var(--measure-reading)] leading-relaxed">{line.description}</p>
          {line.fabrication ? (
            <p className="max-w-[var(--measure-reading)] rounded-lg border border-rule-line p-4 text-sm">
              <strong className="font-medium">{p.fabrication}</strong> {line.fabrication}
            </p>
          ) : null}

          {sheet.length > 0 ? (
            <section aria-labelledby="sheet" className="flex flex-col gap-2">
              <h2 id="sheet" className="font-display text-xl">
                {p.dataSheet}
              </h2>
              <dl className="grid gap-x-8 sm:grid-cols-2">
                {sheet.map((row) => (
                  <div key={row.label} className="flex justify-between gap-4 border-b border-rule-line/60 py-1.5 text-sm">
                    <dt className="text-ink-muted">{row.label}</dt>
                    <dd className="text-right font-mono tabular-nums">{row.value}</dd>
                  </div>
                ))}
              </dl>
              {indices.specific_strength !== null || indices.specific_stiffness !== null ? (
                <div className="max-w-[var(--measure-reading)] rounded-lg border border-rule-line p-4 text-sm">
                  <p className="font-medium">{p.indices}</p>
                  <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs tabular-nums">
                    {indices.specific_strength !== null ? (
                      <li>{p.specificStrength(indices.specific_strength.toFixed(1))}</li>
                    ) : null}
                    {indices.specific_stiffness !== null ? (
                      <li>{p.specificStiffness(indices.specific_stiffness.toFixed(1))}</li>
                    ) : null}
                    {indices.strength_per_dollar !== null ? (
                      <li>{p.strengthPerDollar(indices.strength_per_dollar.toFixed(2))}</li>
                    ) : null}
                  </ul>
                  <p className="mt-2 text-xs text-ink-muted">{p.indicesNote}</p>
                </div>
              ) : null}
            </section>
          ) : (
            <p className="max-w-[var(--measure-reading)] rounded-lg border border-rule-line p-4 text-sm">
              <strong className="font-medium">{p.processHeading}</strong> {p.processBody}
            </p>
          )}
        </article>
      </div>

      {line.related.length > 0 ? (
        <section aria-labelledby="related" className="flex flex-col gap-4">
          <h2 id="related" className="font-display text-2xl">
            {p.related}
          </h2>
          <LineGrid lines={line.related} />
        </section>
      ) : null}
    </>
  );
}
