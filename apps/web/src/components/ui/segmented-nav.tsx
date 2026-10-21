import Link from "next/link";

// A segmented control made of links (decision 0102): the way a surface offers
// a few views of the same list (a filter, a topic, a tab) with the choice in
// the URL, so it survives a reload and needs no script. The current segment
// is lifted onto the raised surface inside a sunken track; the rest stay
// quiet text. Counts are tabular. Server-compatible.
export type Segment = {
  href: string;
  label: string;
  count?: number;
  current: boolean;
};

export function SegmentedNav({
  label,
  segments,
  // What aria-current says on the chosen segment: "page" when the segments
  // are pages, "true" when they are views of one page (a filter, a topic).
  current = "page",
  className,
}: {
  label: string;
  segments: Segment[];
  current?: "page" | "true";
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ul className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-surface-sunken p-1">
        {segments.map((segment) => (
          <li key={segment.href} className="shrink-0">
            <Link
              href={segment.href}
              aria-current={segment.current ? current : undefined}
              className={
                "inline-flex min-h-8 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap " +
                "transition-[background-color,color,box-shadow] duration-(--motion-duration) ease-(--motion-ease) " +
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
                (segment.current
                  ? "bg-surface font-medium text-ink shadow-raised"
                  : "text-ink-muted hover:text-ink")
              }
            >
              <span>{segment.label}</span>
              {segment.count != null ? (
                <span className="tabular-nums text-xs text-ink-muted">{segment.count}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
