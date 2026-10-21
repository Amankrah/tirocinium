"use client";

// The request for quotation (decision 0076, restyled in 0105). The student
// answers what a supplier would need before putting a number on paper, and
// gets back application-engineering notes from the catalogue's authored
// rules.
//
// The copy says the notes are rules and not a model, which matters in both
// directions: a student who thought a machine wrote them would either trust
// them too far or dismiss them, and neither is what an authored rule deserves.
//
// There is no name field and there never will be. A seat is anonymous, and this
// is the one form on the platform that would otherwise be tempted to collect a
// person.
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import type { Rfq, RfqRequest } from "@/lib/api/marketplace";
import { strings } from "../strings";

// Both marketplaces answer with the same advice; only the case-study one
// stores the request and gives it a reference, and the panel reads neither.
type Answer = { advice: Rfq["advice"] };

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
  answer: Answer | null;
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
        <Field label={s.quantityLabel}>
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

      {answer ? (
        <section aria-label={s.answer} className="flex flex-col gap-3">
          <Card as="div" className="flex flex-col gap-4">
            <h3 className="font-display text-xl">{s.answer}</h3>
            {answer.advice.missing.length > 0 ? (
              <div className="flex flex-col gap-1.5 rounded-lg bg-surface-sunken px-4 py-3">
                <p className="text-sm font-medium">{s.missing}</p>
                <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm text-ink-muted">
                  {answer.advice.missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ul className="flex flex-col divide-y divide-rule-line text-sm leading-relaxed">
              {answer.advice.notes.map((note) => (
                <li key={note.rule} className="py-2 first:pt-0 last:pb-0">
                  {note.text}
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-xs text-ink-muted">{s.authored}</p>
        </section>
      ) : null}
    </section>
  );
}
