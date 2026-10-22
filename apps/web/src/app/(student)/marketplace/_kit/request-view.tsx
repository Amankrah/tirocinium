"use client";

// Request a quotation (decision 0101, restyled in 0105): name the line,
// answer what a supplier would need, and get the supplier desk's reply back
// (decision 0108). The figures in it are the catalogue's own; the prose is a
// model's when a desk is configured and the authored rules otherwise, and the
// panel says which. Nothing is kept. There is no name or group field, unlike
// the prototype's form: a student here is a seat, and this is the one form
// that would otherwise be tempted to collect a person.
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
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
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <h1 className="max-w-[20ch] font-display text-4xl leading-[1.05]">{p.requestTitle}</h1>
        <p className="max-w-[var(--measure-reading)] text-pretty text-ink-muted">{p.requestLede}</p>
        <p className="flex max-w-[var(--measure-reading)] items-start gap-2 text-sm text-ink-muted">
          <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
          {p.requestNothingSent}
        </p>
      </header>
      <Field label={p.requestLine} className="max-w-sm">
        <Input
          value={sku}
          onChange={(event) => setSku(event.currentTarget.value)}
          placeholder={p.requestLinePlaceholder}
          autoCapitalize="characters"
          spellCheck={false}
          className="font-mono tabular-nums"
        />
      </Field>
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
            {market.inBasket(named.sku) ? <Icon name="check" size={14} /> : <Icon name="plus" size={14} />}
            {market.inBasket(named.sku) ? s.added : p.addSkuToQuote(named.sku)}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
