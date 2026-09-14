"use client";

// The request for quotation (decision 0062). The student answers what a
// supplier would need before putting a number on paper, and gets back
// application-engineering notes from the catalogue's authored rules.
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
import type { Rfq, RfqRequest } from "@/lib/api/marketplace";
import { strings } from "../../../strings";

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
  answer: Rfq | null;
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
    <section aria-labelledby="rfq" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 id="rfq" className="font-display text-2xl">
          {s.heading}
        </h2>
        <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">{s.hint}</p>
      </header>

      <form
        className="grid gap-4 sm:grid-cols-2"
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
          <input
            value={component}
            onChange={(event) => setComponent(event.currentTarget.value)}
            maxLength={200}
            className={INPUT}
          />
        </Field>
        <Field label={s.quantityLabel}>
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.currentTarget.value)}
            maxLength={80}
            className={INPUT}
          />
        </Field>
        <Field label={s.volume}>
          <select
            value={volume}
            onChange={(event) =>
              setVolume(event.currentTarget.value as RfqRequest["volume"])
            }
            className={INPUT}
          >
            {VOLUMES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={s.environment}>
          <select
            value={environment}
            onChange={(event) =>
              setEnvironment(event.currentTarget.value as RfqRequest["environment"])
            }
            className={INPUT}
          >
            {ENVIRONMENTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={s.certification}>
          <select
            value={certification}
            onChange={(event) =>
              setCertification(event.currentTarget.value as RfqRequest["certification"])
            }
            className={INPUT}
          >
            {CERTIFICATIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={s.tolerance}>
          <input
            value={tolerance}
            onChange={(event) => setTolerance(event.currentTarget.value)}
            maxLength={300}
            className={INPUT}
          />
        </Field>
        <Field label={s.notes} wide>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
            maxLength={1000}
            rows={3}
            className={INPUT}
          />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? s.sending : s.send}
          </Button>
        </div>
      </form>

      {answer ? (
        <section
          aria-label={s.answer}
          className="flex flex-col gap-3 rounded-lg border border-rule-line p-4"
        >
          <h3 className="font-display text-lg">{s.answer}</h3>
          {answer.advice.missing.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{s.missing}</p>
              <ul className="flex flex-col gap-0.5 text-sm text-ink-muted">
                {answer.advice.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <ul className="flex flex-col gap-2 text-sm">
            {answer.advice.notes.map((note) => (
              <li key={note.rule}>{note.text}</li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">{s.authored}</p>
        </section>
      ) : null}
    </section>
  );
}

const INPUT =
  "w-full rounded-md border border-rule-line bg-transparent px-3 py-2 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
