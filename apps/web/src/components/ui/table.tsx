import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

// Tables for the professor's dense surfaces (decision 0102): a seat roster, a
// report. Ruled with the hairline, a quiet uppercase header, rows that lift
// on hover, numbers right-aligned and tabular. The table scrolls inside its
// own frame on a narrow screen rather than widening the page.
// Server-compatible.
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      // A frame that scrolls sideways on a narrow screen must be reachable
      // by keyboard (WCAG 2.1.1); the focus ring is the shared one.
      tabIndex={0}
      className={[
        "overflow-x-auto rounded-lg border border-rule-line bg-surface focus-ring",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  justify = "start",
  className,
  children,
  ...rest
}: Omit<ThHTMLAttributes<HTMLTableCellElement>, "align"> & { justify?: "start" | "end" }) {
  return (
    <th
      scope="col"
      className={[
        "border-b border-rule-line bg-surface-sunken/60 px-3.5 py-2.5 text-xs font-medium tracking-wide text-ink-muted uppercase",
        justify === "end" ? "text-end" : "text-start",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  justify = "start",
  numeric = false,
  className,
  children,
  ...rest
}: Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> & {
  justify?: "start" | "end";
  numeric?: boolean;
}) {
  return (
    <td
      className={[
        "border-b border-rule-line px-3.5 py-3 align-top",
        justify === "end" ? "text-end" : "text-start",
        numeric ? "font-mono tabular-nums" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr
      className={[
        "transition-colors duration-(--motion-duration) ease-(--motion-ease) hover:bg-surface-sunken/40 [&:last-child>td]:border-b-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </tr>
  );
}
