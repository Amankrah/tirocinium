"use client";

// A client island per seat: reissue returns a fresh plaintext code shown exactly
// once, so this holds it in state and a copy control puts it on the clipboard
// before the professor navigates away.
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { strings } from "../../../strings";
import type { ReissueState } from "./actions";

export function ReissueSeat({
  seatNumber,
  action,
}: {
  seatNumber: string;
  action: () => Promise<ReissueState>;
}) {
  const [state, setState] = useState<ReissueState>({ code: null, error: false });
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const s = strings.seats;

  function onReissue() {
    startTransition(async () => {
      setCopied(false);
      setState(await action());
    });
  }

  async function copy() {
    if (!state.code) return;
    try {
      await navigator.clipboard.writeText(state.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant="quiet" size="sm" type="button" onClick={onReissue} disabled={pending}>
        {s.reissue}
      </Button>
      {state.code ? (
        <div role="status" className="flex flex-col items-end gap-1.5">
          <span className="text-xs text-ink-muted">{s.reissued(seatNumber)}</span>
          <div className="flex items-center gap-2">
            <code className="rounded-md border border-accent/20 bg-accent-soft px-2 py-1 font-mono text-sm tabular-nums text-accent-text">
              {state.code}
            </code>
            <Button variant="secondary" size="sm" type="button" onClick={copy}>
              {copied ? s.copied : s.copy}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
