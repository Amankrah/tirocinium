"use client";

// A client island: the count field is interactive and the batch result (the
// one-time download links) must appear after submission, so this holds state
// and calls the bound server action directly. Not a server component.
//
// The download moment is the one guide 4.0b says must be unmissable: a raised
// sheet with an accent band, the two files as the page's buttons, and the
// locked-version line in full. The region is a live status so the files are
// announced the moment they exist.
import { useState, useTransition, type FormEvent } from "react";

import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { strings } from "../../../strings";
import type { GenerateState } from "./actions";

export function GenerateSeats({
  action,
}: {
  action: (formData: FormData) => Promise<GenerateState>;
}) {
  const [state, setState] = useState<GenerateState>({ batch: null, error: false });
  const [pending, startTransition] = useTransition();
  const s = strings.seats;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => setState(await action(formData)));
  }

  return (
    <div className="flex flex-col gap-4">
      <Card as="section" aria-labelledby="generate-seats-heading">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <SectionHeading id="generate-seats-heading" title={s.generateHeading} level={3} rule={false} />
          <div className="flex flex-wrap items-end gap-3">
            <Field label={s.countLabel} className="w-36">
              <Input
                name="count"
                type="number"
                min={1}
                max={500}
                defaultValue={30}
                required
                className="font-mono tabular-nums"
              />
            </Field>
            <Button type="submit" disabled={pending}>
              {s.generateAction}
            </Button>
          </div>
        </form>
      </Card>

      <div role="status" className="min-h-6">
        {state.batch ? (
          <div className="surface-raised overflow-hidden">
            <div className="flex flex-col gap-1 border-b border-accent/20 bg-accent-soft px-5 py-4 sm:px-6">
              <p className="font-display text-xl text-accent-text">
                {s.batchReady(state.batch.count)}
              </p>
              <p className="text-sm font-medium text-ink">{s.downloadNow}</p>
            </div>
            <div className="flex flex-wrap gap-3 px-5 py-4 sm:px-6">
              <a href={state.batch.csv_url} className={buttonClassName("primary")}>
                <Icon name="file" size={16} />
                {s.csvLink}
              </a>
              <a href={state.batch.pdf_url} className={buttonClassName("secondary")}>
                <Icon name="print" size={16} />
                {s.pdfLink}
              </a>
            </div>
          </div>
        ) : state.error ? (
          <p className="text-sm text-ink">{s.note}</p>
        ) : null}
      </div>
    </div>
  );
}
