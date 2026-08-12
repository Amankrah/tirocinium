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
      <Button
        variant="quiet"
        type="button"
        onClick={onReissue}
        disabled={pending}
        className="text-sm"
      >
        {s.reissue}
      </Button>
      {state.code ? (
        <div role="status" className="flex flex-col items-end gap-1">
          <span className="text-xs text-ink-muted">{s.reissued(seatNumber)}</span>
          <div className="flex items-center gap-2">
            <code className="rounded bg-rule-line/40 px-2 py-1 font-mono text-sm text-ink">
              {state.code}
            </code>
            <button
              type="button"
              onClick={copy}
              className="text-xs text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {copied ? s.copied : s.copy}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
