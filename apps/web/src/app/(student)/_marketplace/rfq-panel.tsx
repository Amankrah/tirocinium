"use client";

// The request for quotation (decision 0076, restyled in 0105, answered by the
// supplier desk since 0108). The student answers what a supplier would need
// before putting a number on paper, and gets back what a supplier's sales
// desk would write: what they understood, the offer, what they still need,
// the application points, an alternative when the request calls for one.
//
// The figures are never the model's. The priced table is the server's quote
// arithmetic for the quantity asked, and every dollar figure in the desk's
// prose was checked against it before the reply was allowed through. When no
// desk is configured, or its reply failed that check, the authored notes
// answer alone and the footer says so, because a student who thought a
// machine wrote the rules would trust them too far or too little.
//
// There is no name field and there never will be. A seat is anonymous, and this
// is the one form on the platform that would otherwise be tempted to collect a
// person.
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import type { Rfq, RfqRequest } from "@/lib/api/marketplace";
import { lead, money } from "@/lib/money";
import { strings } from "../strings";

// Both marketplaces answer with the same shape; only the case-study one stores
// the request and gives it a reference, and the panel reads neither.
export type RfqAnswer = Pick<Rfq, "advice" | "priced" | "reply">;

const VOLUMES: [RfqRequest["volume"], string][] = [
  ["prototype", "Prototype, 1 to 5 pieces"],
  ["small_batch", "Small batch, 10 to 100"],
  ["production", "Production, 1 000 to 10 000"],
  ["high_volume", "High volume, over 50 000"],
];

const ENVIRONMENTS: [RfqRequest["environment"], string][] = [
  ["indoor", "Indoor, dry, ambient"],
  ["outdoor", "Outdoor, Québec climate"],
  ["washdown", "Wet or wash-down, food contact"],
  ["chemical", "Chemically aggressive"],
  ["elevated_temperature", "Above 100 °C"],
  ["buried", "Buried or immersed"],
];

const CERTIFICATIONS: [RfqRequest["certification"], string][] = [
  ["none", "None, internal prototype"],
  ["mill_test_report", "Mill test report (CMTR)"],
  ["sanitary_3a", "3-A sanitary / food contact"],
  ["pressure_code", "Pressure code (ASME / CSA B51)"],
  ["structural", "Structural (CSA S16 / S136)"],
];

export function RfqPanel({
  sku,
  pending,
  answer,
  onSend,
}: {
  sku: string | null;
  pending: boolean;
  answer: RfqAnswer | null;
  onSend: (request: RfqRequest) => void;
}) {
  const s = strings.marketplace.rfq;
  const [component, setComponent] = useState("");
  const [quantity, setQuantity] = useState("");
  const [volume, setVolume] = useState<RfqRequest["volume"]>("prototype");
  const [environment, setEnvironment] = useState<RfqRequest["environment"]>("indoor");
  const [certification, setCertification] =
    useState<RfqRequest["certification"]>("none");
  const [tolerance, setTolerance] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [shipTo, setShipTo] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <section aria-labelledby="rfq" className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 id="rfq" className="font-display text-2xl">
          {s.heading}
        </h2>
        <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">{s.hint}</p>
      </header>

      <Card
        as="form"
        className="grid gap-5 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSend({
            sku,
            component,
            quantity,
            volume,
            environment,
            certification,
            tolerance,
            needed_by: neededBy,
            ship_to: shipTo,
            notes,
          });
        }}
      >
        <Field label={s.component}>
          <Input
            value={component}
            onChange={(event) => setComponent(event.currentTarget.value)}
            maxLength={200}
          />
        </Field>
        <Field label={s.quantityLabel} hint={s.quantityHint}>
          <Input
            value={quantity}
            onChange={(event) => setQuantity(event.currentTarget.value)}
            maxLength={80}
          />
        </Field>
        <Field label={s.volume}>
          <Select
            value={volume}
            onChange={(event) =>
              setVolume(event.currentTarget.value as RfqRequest["volume"])
            }
          >
            {VOLUMES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={s.environment}>
          <Select
            value={environment}
            onChange={(event) =>
              setEnvironment(event.currentTarget.value as RfqRequest["environment"])
            }
          >
            {ENVIRONMENTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={s.certification}>
          <Select
            value={certification}
            onChange={(event) =>
              setCertification(event.currentTarget.value as RfqRequest["certification"])
            }
          >
            {CERTIFICATIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={s.tolerance}>
          <Input
            value={tolerance}
            onChange={(event) => setTolerance(event.currentTarget.value)}
            maxLength={300}
          />
        </Field>
        <Field label={s.neededBy}>
          <Input
            value={neededBy}
            onChange={(event) => setNeededBy(event.currentTarget.value)}
            maxLength={120}
          />
        </Field>
        <Field label={s.shipTo}>
          <Input
            value={shipTo}
            onChange={(event) => setShipTo(event.currentTarget.value)}
            maxLength={160}
          />
        </Field>
        <Field label={s.notes} className="sm:col-span-2">
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
            maxLength={1000}
            rows={3}
          />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? s.sending : s.send}
            {pending ? null : <Icon name="arrow-right" size={14} />}
          </Button>
        </div>
      </Card>

      {answer ? <Reply answer={answer} /> : null}
    </section>
  );
}

function Reply({ answer }: { answer: RfqAnswer }) {
  const s = strings.marketplace.rfq;
  const { reply, advice, priced } = answer;
  // The generated type leaves a list the server defaults to empty optional.
  const questions = reply?.questions ?? [];
  const notes = reply?.notes ?? [];
  const alternatives = reply?.alternatives ?? [];
  return (
    <section aria-label={s.answer} className="flex flex-col gap-3">
      <Card as="div" className="flex flex-col gap-5">
        {reply ? (
          <>
            <header className="flex flex-col gap-1">
              <p className="text-xs tracking-wide text-ink-muted uppercase">{s.answer}</p>
              <h3 className="font-display text-xl">{reply.subject}</h3>
            </header>
            <p className="max-w-[var(--measure-reading)] text-sm leading-relaxed">
              {reply.opening}
            </p>
            <Paragraphs text={reply.offer} />
            {priced ? <PricedTable priced={priced} /> : null}
            {questions.length > 0 ? (
              <Points heading={s.questions} items={questions} />
            ) : null}
            {notes.length > 0 ? (
              <Points heading={s.applicationNotes} items={notes} />
            ) : null}
            {alternatives.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium">{s.alternatives}</p>
                <ul className="flex flex-col gap-1.5 text-sm text-ink-muted">
                  {alternatives.map((alternative) => (
                    <li key={alternative.sku} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                      <span className="shrink-0 font-mono text-xs text-ink">{alternative.sku}</span>
                      <span>{alternative.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Paragraphs text={reply.closing} />
          </>
        ) : (
          <>
            <h3 className="font-display text-xl">{s.answer}</h3>
            {advice.missing.length > 0 ? (
              <div className="flex flex-col gap-1.5 rounded-lg bg-surface-sunken px-4 py-3">
                <p className="text-sm font-medium">{s.missing}</p>
                <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm text-ink-muted">
                  {advice.missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {priced ? <PricedTable priced={priced} /> : null}
            <ul className="flex flex-col divide-y divide-rule-line text-sm leading-relaxed">
              {advice.notes.map((note) => (
                <li key={note.rule} className="py-2 first:pt-0 last:pb-0">
                  {note.text}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <p className="text-xs text-ink-muted">{reply ? s.fromDesk : s.fromRules}</p>
    </section>
  );
}

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="flex max-w-[var(--measure-reading)] flex-col gap-2 text-sm leading-relaxed">
      {text
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
    </div>
  );
}

function Points({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">{heading}</p>
      <ul className="flex max-w-[var(--measure-reading)] list-disc flex-col gap-1 pl-5 text-sm leading-relaxed">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

// The figures, as the server worked them: the quantity it quoted (the minimum
// order applied where it had to be), the unit price after any break, the
// goods, freight, taxes and total. Nothing here is computed in the browser.
function PricedTable({ priced }: { priced: NonNullable<RfqAnswer["priced"]> }) {
  const s = strings.marketplace.rfq;
  const { lines, totals, notices } = priced;
  return (
    <div className="flex flex-col gap-2">
      <Table>
        <thead>
          <tr>
            <Th>{s.tableLine}</Th>
            <Th justify="end">{s.tableQuantity}</Th>
            <Th justify="end">{s.tableUnitPrice}</Th>
            <Th justify="end">{s.tableAmount}</Th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <Tr key={line.sku}>
              <Td>
                <span className="font-mono text-xs">{line.sku}</span>
                <span className="block text-ink-muted">{line.name}</span>
              </Td>
              <Td justify="end" numeric>
                {line.quantity} {line.unit_label}
              </Td>
              <Td justify="end" numeric>
                {money(line.unit_price_cents)}
                {line.break_percent > 0 ? (
                  <span className="block text-xs text-ink-muted">
                    {s.breakApplied(line.break_percent)}
                  </span>
                ) : null}
              </Td>
              <Td justify="end" numeric>
                {money(line.extended_cents)}
              </Td>
            </Tr>
          ))}
          {totals.cut_fee_cents > 0 ? (
            <Tr>
              <Td colSpan={3}>{s.cutting}</Td>
              <Td justify="end" numeric>
                {money(totals.cut_fee_cents)}
              </Td>
            </Tr>
          ) : null}
          <Tr>
            <Td colSpan={3}>{s.freight}</Td>
            <Td justify="end" numeric>
              {money(totals.freight_cents)}
            </Td>
          </Tr>
          {totals.taxes.map((tax) => (
            <Tr key={tax.code}>
              <Td colSpan={3}>{tax.code}</Td>
              <Td justify="end" numeric>
                {money(tax.amount_cents)}
              </Td>
            </Tr>
          ))}
          <Tr>
            <Td colSpan={3} className="font-medium">
              {s.total}
            </Td>
            <Td justify="end" numeric className="font-medium">
              {money(totals.total_cents)}
            </Td>
          </Tr>
        </tbody>
      </Table>
      <p className="text-xs text-ink-muted">
        {s.leadAndBasis(lead(totals.longest_lead_days))}
      </p>
      {notices.map((notice) => (
        <p key={notice} className="text-xs text-ink-muted">
          {notice}
        </p>
      ))}
    </div>
  );
}
