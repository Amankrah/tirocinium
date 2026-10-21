import type { HTMLAttributes, ReactNode } from "react";

// A sheet on the paper (decision 0102). Raised is the default: one step
// lighter than the ground, a hairline, and a low warm shadow. Flat keeps the
// hairline and drops the lift, for lists of many cards where every one
// raised would be noise. Sunken is a recess for a control's track or a
// preview well. Cards are used sparingly (guide 3.2); hairlines and margins
// still do most of the organizing. Server-compatible.
// Accent is the one tinted sheet: a live or recommended thing (the revisit
// queue, a selected item), never decoration.
export type CardTone = "raised" | "flat" | "sunken" | "accent";

const tones: Record<CardTone, string> = {
  raised: "surface-raised",
  flat: "rounded-lg border border-rule-line bg-surface",
  sunken: "rounded-lg bg-surface-sunken",
  accent: "rounded-lg border border-accent/20 bg-accent-soft",
};

export function Card({
  tone = "raised",
  padded = true,
  as: Tag = "div",
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & {
  tone?: CardTone;
  padded?: boolean;
  as?: "div" | "section" | "article" | "li" | "aside" | "form";
  children: ReactNode;
}) {
  return (
    <Tag
      className={[tones[tone], padded ? "p-5 sm:p-6" : "", className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </Tag>
  );
}
