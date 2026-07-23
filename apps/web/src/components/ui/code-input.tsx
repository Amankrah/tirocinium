"use client";

// Client component: the seat-code field formats as the student types (guide
// 4.0), which requires controlled-input interactivity.

import { useId, type ChangeEvent } from "react";

// Crockford base32: digits and letters minus I, L, O, U. Entry is forgiving
// where decoding is unambiguous (o reads as 0; i and l as 1); U and anything
// else outside the alphabet is dropped rather than rejected loudly, because
// the honest failure copy on submit already covers every malformed case.
const CODE_LENGTH = 16;
const GROUP = 4;

export function normalizeSeatCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/[^0-9A-HJ-KM-NP-TV-Z]/g, "")
    .slice(0, CODE_LENGTH);
}

export function formatSeatCode(code: string): string {
  return code.match(new RegExp(`.{1,${GROUP}}`, "g"))?.join("-") ?? "";
}

type CodeInputProps = {
  label: string;
  value: string;
  onChange: (code: string) => void;
};

export function CodeInput({ label, value, onChange }: CodeInputProps) {
  const id = useId();

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(normalizeSeatCode(event.target.value));
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm text-ink">
        {label}
      </label>
      <input
        id={id}
        value={formatSeatCode(value)}
        onChange={handleChange}
        placeholder="XXXX-XXXX-XXXX-XXXX"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        className={
          "rounded-md border border-rule-line bg-paper px-4 py-3 " +
          "font-mono text-lg tracking-widest text-ink " +
          "placeholder:text-ink/30 " +
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        }
      />
    </div>
  );
}
