"use client";

// A client island: the count field is interactive and the batch result (the
// one-time download links) must appear after submission, so this holds state
// and calls the bound server action directly. Not a server component.
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
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
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-ink">{s.countLabel}</span>
          <input
            name="count"
            type="number"
            min={1}
            max={500}
            defaultValue={30}
            required
            className="w-32 rounded-md border border-rule-line bg-paper px-4 py-3 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </label>
        <Button type="submit" disabled={pending}>
          {s.generateAction}
        </Button>
      </form>

      <div role="status" className="min-h-6">
        {state.batch ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink">{s.batchReady(state.batch.count)}</p>
            <div className="flex flex-wrap gap-4">
              <a
                href={state.batch.csv_url}
                className="text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {s.csvLink}
              </a>
              <a
                href={state.batch.pdf_url}
                className="text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
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
