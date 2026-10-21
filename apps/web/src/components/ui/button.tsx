import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// The button primitive (decision 0102). Primary carries the accent (guide 3.2:
// the accent is for primary actions and live states only); secondary is the
// bordered sheet for the second action in a pair; quiet is text-only for
// everything else; danger is reserved for the two destructive seat verbs and
// discard, and still uses the amber of the palette rather than a new red.
// Focus is part of the visual language (guide 6): a two-pixel accent outline
// with offset, never the default ring. Server-compatible: no client runtime.
export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium " +
  "whitespace-nowrap select-none " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-(--motion-duration) ease-(--motion-ease) " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "active:translate-y-px " +
  "disabled:opacity-50 disabled:pointer-events-none";

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 py-1.5 text-sm",
  md: "min-h-10 px-4 py-2 text-sm",
  lg: "min-h-12 px-6 py-3 text-base",
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-on-accent shadow-raised hover:brightness-110 hover:shadow-floating",
  secondary:
    "border border-field-border bg-surface text-ink shadow-raised hover:border-ink hover:bg-surface-sunken/60",
  quiet: "bg-transparent text-ink hover:bg-surface-sunken",
  danger:
    "border border-flag-amber/40 bg-transparent text-flag-amber hover:bg-flag-amber-soft",
};

export function buttonClassName(
  variant: ButtonVariant = "primary",
  className?: string,
  size: ButtonSize = "md",
): string {
  return [base, sizes[size], variants[variant], className].filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClassName(variant, className, size)} {...rest} />
  );
}

// Same look as Button, as a link: landing doors and other navigation that
// should read as an action without becoming a <button> that cannot be opened
// in a new tab.
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClassName(variant, className, size)}>
      {children}
    </Link>
  );
}
