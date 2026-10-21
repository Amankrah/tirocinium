import type { ReactNode } from "react";

// A small status chip (decision 0102). Tones are the palette doing its stated
// jobs: green and amber strictly for variant and recognition states (guide
// 3.2), accent for a live or selected state, neutral for everything else.
// Text is always the solid token on its own tint, which is inside the
// contrast audit. Server-compatible.
export type BadgeTone = "neutral" | "accent" | "green" | "amber" | "ink";

const tones: Record<BadgeTone, string> = {
  neutral: "border-rule-line bg-surface-sunken text-ink-muted",
  accent: "border-accent/20 bg-accent-soft text-accent-text",
  green: "border-verify-green/20 bg-verify-green-soft text-verify-green",
  amber: "border-flag-amber/25 bg-flag-amber-soft text-flag-amber",
  ink: "border-ink bg-ink text-paper",
};

export function Badge({
  tone = "neutral",
  mono = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  // Mono for values a professor might copy or compare: seat numbers, seeds.
  mono?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5",
        mono ? "font-mono tabular-nums" : "",
        tones[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
