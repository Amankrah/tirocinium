import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// The button primitive. Primary carries the accent (guide 3.2: the accent is
// for primary actions and live states only); quiet is for everything else.
// Focus is part of the visual language (guide 6): a two-pixel accent outline
// with offset, never the default ring. Server-compatible: no client runtime.
type Variant = "primary" | "quiet";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const base =
  "inline-flex items-center justify-center rounded-md px-4 py-2 font-medium " +
  "transition-colors duration-(--motion-duration) ease-(--motion-ease) " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "disabled:opacity-50 disabled:pointer-events-none";

const variants = {
  primary: "bg-accent text-on-accent hover:brightness-110",
  quiet: "bg-transparent text-ink hover:bg-rule-line/40",
} as const;

export function buttonClassName(variant: Variant = "primary", className?: string): string {
  return [base, variants[variant], className].filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  return <button type={type} className={buttonClassName(variant, className)} {...rest} />;
}

// Same look as Button, as a link: landing doors and other navigation that
// should read as an action without becoming a <button> that cannot be opened
// in a new tab.
export function ButtonLink({
  href,
  variant = "primary",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClassName(variant, className)}>
      {children}
    </Link>
  );
}
