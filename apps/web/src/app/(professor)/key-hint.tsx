import { Fragment } from "react";

import { Kbd } from "@/components/ui/kbd";

// The keyboard line on the professor queues (guide 4.4), with each key drawn
// as a key. The sentence stays one string in strings.ts, so what a screen
// reader hears and what a test asserts on textContent are unchanged; only the
// rendering of the key names changes. The pattern matches the bare key names
// those sentences use (j, k, a, e, Enter) as whole words. Server-compatible.
const KEY = /\b(j|k|a|e|Enter)\b/g;

export function KeyHint({
  id,
  text,
  className,
}: {
  id?: string;
  text: string;
  className?: string;
}) {
  const parts = text.split(KEY);
  return (
    <p id={id} className={["text-xs text-ink-muted", className].filter(Boolean).join(" ")}>
      {parts.map((part, index) =>
        index % 2 === 1 ? <Kbd key={index}>{part}</Kbd> : <Fragment key={index}>{part}</Fragment>,
      )}
    </p>
  );
}
