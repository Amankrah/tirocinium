"use client";

// Ordering a line by the piece (decision 0114): the length, the width where
// the form has one, and how many, within the shop's minimum, maximum and
// increment. Every figure shown (each piece's mass, the quantity it comes to
// in the unit of sale, the cuts, the fee, the line total, the stock consumed
// and what is left) is the server's, from the same arithmetic the quotation
// uses: the panel sends dimensions and reads back a priced line, and never
// multiplies anything itself. A piece the shop would not cut comes back as
// the shop's own refusal, which is what the student would hear.
import { useEffect, useState, useTransition } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import type { LineDetail, Piece, ProjectQuotation, QuoteLine, Result } from "@/lib/api/marketplace";
import { mass, money } from "@/lib/money";
import { strings } from "../strings";

const MAX_SIZES = 5;
const HAS_WIDTH = new Set(["plate", "sheet", "roll"]);

type Draft = { length: string; width: string; count: string };

function toPieces(drafts: Draft[], needsWidth: boolean): Piece[] {
  const pieces: Piece[] = [];
  for (const draft of drafts) {
    const length = Number(draft.length);
    const width = Number(draft.width);
    const count = Math.round(Number(draft.count));
    if (!(length > 0) || !(count >= 1)) continue;
    if (needsWidth && !(width > 0)) continue;
    pieces.push({ length_mm: length, width_mm: width > 0 ? width : null, count });
  }
  return pieces;
}

export function CutToSize({
  line,
  preview,
  onAdd,
}: {
  line: LineDetail;
  // Prices one line and hands back the quotation it would be; nothing is kept.
  preview: (lines: QuoteLine[]) => Promise<Result<ProjectQuotation>>;
  onAdd: (pieces: Piece[]) => void;
}) {
  const c = strings.project.cut;
  const geometry = line.geometry;
  const rule = geometry?.cut;
  const form = geometry?.form ?? "each";
  const needsWidth = HAS_WIDTH.has(form);
  const [drafts, setDrafts] = useState<Draft[]>([{ length: "", width: "", count: "1" }]);
  const [priced, setPriced] = useState<ProjectQuotation | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pieces = toPieces(drafts, needsWidth);
  const key = JSON.stringify(pieces);

  useEffect(() => {
    if (pieces.length === 0) {
      setPriced(null);
      return;
    }
    startTransition(async () => {
      const result = await preview([
        { sku: line.sku, quantity: 0, cut_to_length: true, cut_count: 1, pieces },
      ]);
      if (result.ok) {
        setPriced(result.data);
        setFailure(null);
      } else {
        setFailure(result.detail || strings.marketplace.offline);
      }
    });
    // `key` stands for the pieces; the action is a stable server reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!geometry || !rule) return null;

  const pricedLine = priced?.lines.find((entry) => entry.sku === line.sku) ?? null;
  const refusals = priced?.notices.filter((note) => note.startsWith(`${line.sku}:`) && !pricedLine) ?? [];
  const totalCount = pieces.reduce((sum, piece) => sum + piece.count, 0);

  function update(index: number, change: Partial<Draft>) {
    setDrafts((current) => current.map((draft, i) => (i === index ? { ...draft, ...change } : draft)));
  }

  return (
    <section aria-labelledby="cut-to-size" className="flex flex-col gap-4 border-t border-rule-line pt-4">
      <div className="flex flex-col gap-1">
        <h2 id="cut-to-size" className="text-sm font-medium">
          {c.heading}
        </h2>
        <p className="text-xs text-ink-muted">
          {c.rule(rule.min_mm, rule.max_mm, rule.increment_mm, rule.tolerance_mm, money(rule.fee_cents))}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {drafts.map((draft, index) => (
          <li key={index} className="grid grid-cols-[1fr_1fr_4.5rem] items-end gap-2">
            <Field label={c.length}>
              <Input
                type="number"
                inputMode="decimal"
                min={rule.min_mm}
                max={rule.max_mm}
                step={rule.increment_mm}
                value={draft.length}
                onChange={(event) => update(index, { length: event.currentTarget.value })}
                className="font-mono tabular-nums"
              />
            </Field>
            {needsWidth ? (
              <Field label={c.width}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={rule.min_mm}
                  step={rule.increment_mm}
                  value={draft.width}
                  onChange={(event) => update(index, { width: event.currentTarget.value })}
                  className="font-mono tabular-nums"
                />
              </Field>
            ) : (
              <span />
            )}
            <Field label={c.count}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={draft.count}
                onChange={(event) => update(index, { count: event.currentTarget.value })}
                className="font-mono tabular-nums"
              />
            </Field>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {drafts.length < MAX_SIZES ? (
          <Button
            variant="quiet"
            size="sm"
            onClick={() => setDrafts((current) => [...current, { length: "", width: "", count: "1" }])}
          >
            <Icon name="plus" size={14} />
            {c.anotherSize}
          </Button>
        ) : null}
        {drafts.length > 1 ? (
          <Button variant="quiet" size="sm" onClick={() => setDrafts((current) => current.slice(0, -1))}>
            {c.fewerSizes}
          </Button>
        ) : null}
      </div>

      {failure ? (
        <p role="alert" className="text-sm text-flag-amber">
          {failure}
        </p>
      ) : null}
      {refusals.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-flag-amber">
          {refusals.map((note) => (
            <li key={note}>{note.slice(line.sku.length + 1).trim()}</li>
          ))}
        </ul>
      ) : null}

      {pricedLine ? (
        <dl aria-busy={pending} className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-surface-sunken px-4 py-3 text-xs">
          {(pricedLine.pieces ?? []).map((piece) => (
            <div key={`${piece.length_mm}-${piece.width_mm}`} className="col-span-2 flex justify-between gap-3">
              <dt className="text-ink-muted">
                {c.piece(piece.count, piece.length_mm, piece.width_mm ?? null)}
              </dt>
              <dd className="font-mono tabular-nums">{c.each(mass(piece.each_mass_grams))}</dd>
            </div>
          ))}
          <dt className="text-ink-muted">{c.comesTo}</dt>
          <dd className="text-end font-mono tabular-nums">
            {pricedLine.quantity} {pricedLine.unit_label} · {money(pricedLine.extended_cents)}
          </dd>
          <dt className="text-ink-muted">{c.cutting}</dt>
          <dd className="text-end font-mono tabular-nums">
            {c.cuts(pricedLine.cut_count)} · {money(pricedLine.cut_fee_cents)}
          </dd>
          {pricedLine.stock_lengths != null ? (
            <>
              <dt className="text-ink-muted">{c.stock}</dt>
              <dd className="text-end font-mono tabular-nums">
                {c.stockUsed(pricedLine.stock_lengths, form, pricedLine.remnant_mm ?? null)}
              </dd>
            </>
          ) : null}
          <dt className="text-ink-muted">{c.lineTotal}</dt>
          <dd className="text-end font-mono tabular-nums">
            {money(pricedLine.extended_cents + pricedLine.cut_fee_cents)}
          </dd>
        </dl>
      ) : null}

      <Button onClick={() => onAdd(pieces)} disabled={!pricedLine || pending} className="w-full">
        <Icon name="plus" size={14} />
        {c.add(totalCount)}
      </Button>
      <ButtonLink
        href={`/marketplace/request?sku=${encodeURIComponent(line.sku)}`}
        variant="quiet"
        size="sm"
        className="text-ink-muted"
      >
        {c.longer(rule.max_mm)}
      </ButtonLink>
    </section>
  );
}
