import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "./icon";

// The top of every working surface (decision 0102): a quiet way back, an
// optional eyebrow (status, course, section), the title in the display face,
// one line of description, and the page's actions on the right where the
// width allows. One component so every surface starts the same way and a
// student or professor always knows where they are. Server-compatible.
export function PageHeader({
  back,
  eyebrow,
  title,
  description,
  actions,
  size = "md",
  className,
}: {
  back?: { href: string; label: string };
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <header className={["flex flex-col gap-3", className].filter(Boolean).join(" ")}>
      {back ? <BackLink href={back.href}>{back.label}</BackLink> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          {eyebrow ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">{eyebrow}</div>
          ) : null}
          <h1
            className={
              size === "lg"
                ? "font-display text-4xl leading-[1.05] sm:text-5xl"
                : "font-display text-3xl leading-tight sm:text-4xl"
            }
          >
            {title}
          </h1>
          {description ? (
            <p className="max-w-prose text-pretty text-ink-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted transition-colors duration-(--motion-duration) ease-(--motion-ease) hover:text-ink focus-ring rounded-sm"
    >
      <Icon name="arrow-left" size={14} />
      {children}
    </Link>
  );
}
