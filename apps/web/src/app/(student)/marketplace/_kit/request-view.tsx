"use client";

// Request a quotation (decision 0101): name the line, answer what a supplier
// would need, and get the catalogue's application-engineering notes back.
// The notes are authored rules, never a model (decision 0076), and nothing is
// sent anywhere or kept. There is no name or group field, unlike the
// prototype's form: a student here is a seat, and this is the one form that
// would otherwise be tempted to collect a person.
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { LineSummary, ProjectRfq, Result, RfqRequest } from "@/lib/api/marketplace";
import { RfqPanel } from "../../_marketplace/rfq-panel";
import { strings } from "../../strings";
import { useMarket } from "./market-state";

export function RequestView({
  initialSku,
  line,
  ask,
}: {
  initialSku: string;
  // The named line when the student arrived from it, so the reply can offer
  // to put it in the quote.
  line: LineSummary | null;
  ask: (request: RfqRequest) => Promise<Result<ProjectRfq>>;
}) {
  const s = strings.marketplace;
  const p = strings.project;
  const market = useMarket();
  const [sku, setSku] = useState(initialSku);
  const [answer, setAnswer] = useState<ProjectRfq | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send(request: RfqRequest) {
    startTransition(async () => {
      const result = await ask(request);
      if (result.ok) {
        setAnswer(result.data);
        setFailure(null);
      } else {
        setFailure(result.detail || s.offline);
      }
    });
  }

  const named = line && line.sku === sku.trim().toUpperCase() ? line : null;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl">{p.requestTitle}</h1>
        <p className="max-w-[var(--measure-reading)] text-ink-muted">{p.requestLede}</p>
        <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">{p.requestNothingSent}</p>
      </header>
      <label className="flex max-w-sm flex-col gap-1 text-sm">
        {p.requestLine}
        <input
          value={sku}
          onChange={(event) => setSku(event.currentTarget.value)}
          placeholder={p.requestLinePlaceholder}
          className="rounded-md border border-field-border bg-transparent px-3 py-2 font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      </label>
      {failure ? (
        <p role="alert" className="text-sm text-flag-amber">
          {failure}
        </p>
      ) : null}
      <RfqPanel sku={sku.trim() || null} pending={pending} answer={answer} onSend={send} />
      {answer && named ? (
        <div>
          <Button
            onClick={() => market.add({ sku: named.sku, moq: named.moq, name: named.name })}
            disabled={market.inBasket(named.sku)}
          >
            {market.inBasket(named.sku) ? s.added : p.addSkuToQuote(named.sku)}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
