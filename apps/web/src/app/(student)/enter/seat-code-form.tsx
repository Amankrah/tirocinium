"use client";

// Client component: controlled code input, submit state, and the live-region
// failure line all require interactivity. The page around it stays a server
// component.

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { redeemSeatCode } from "@/lib/seats";
import { strings } from "../strings";

const CODE_LENGTH = 16;

export function SeatCodeForm() {
  const [code, setCode] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  function handleCodeChange(next: string) {
    setCode(next);
    setFailed(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // An incomplete code is malformed, and malformed gets the same honest
    // line as wrong or revoked (guide 4.0): no round trip needed to know it
    // cannot redeem.
    if (code.length < CODE_LENGTH) {
      setFailed(true);
      return;
    }
    setPending(true);
    try {
      const result = await redeemSeatCode(code);
      if (!result.ok) setFailed(true);
      // Success resolves into the course home with the seat greeting once
      // redemption exists (backend 1.5).
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-6">
      <CodeInput
        label={strings.enter.codeLabel}
        value={code}
        onChange={handleCodeChange}
      />
      <Button type="submit" disabled={pending}>
        {strings.enter.action}
      </Button>
      <p role="status" className="min-h-6 text-sm text-ink">
        {failed ? strings.enter.failure : ""}
      </p>
    </form>
  );
}
