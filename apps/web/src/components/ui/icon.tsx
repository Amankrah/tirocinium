// A small inline icon set (decision 0102): stroke icons at 1.5px, drawn in
// currentColor so they take the text colour of whatever they sit beside.
// Decorative by contract: every icon sits next to a text label and the
// wrapping span is hidden from assistive technology. The svg itself carries
// no aria attribute, so the hero still (the one aria-hidden svg the
// particle-hero journey counts paths in) stays the only one on the page.
// Server-compatible: no client runtime.
import type { ReactNode } from "react";

export type IconName =
  | "arrow-right"
  | "arrow-left"
  | "arrow-up-right"
  | "chevron-right"
  | "chevron-down"
  | "chevron-up"
  | "arrow-up"
  | "arrow-down"
  | "check"
  | "x"
  | "plus"
  | "search"
  | "upload"
  | "camera"
  | "pen"
  | "mic"
  | "book"
  | "layers"
  | "users"
  | "chart"
  | "inbox"
  | "file"
  | "file-import"
  | "tag"
  | "clock"
  | "lock"
  | "refresh"
  | "sparkle"
  | "log-out"
  | "home"
  | "print"
  | "grid"
  | "history"
  | "help"
  | "store";

const PATHS: Record<IconName, ReactNode> = {
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  "arrow-left": <path d="M19 12H5M11 6l-6 6 6 6" />,
  "arrow-up-right": <path d="M7 17 17 7M8 7h9v9" />,
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-up": <path d="m6 15 6-6 6 6" />,
  "arrow-up": <path d="M12 19V5m0 0-6 6m6-6 6 6" />,
  "arrow-down": <path d="M12 5v14m0 0-6-6m6 6 6-6" />,
  check: <path d="m5 12 5 5L20 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  upload: <path d="M12 16V4m0 0-5 5m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  pen: <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3ZM13 8l3 3" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  book: <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5ZM4 19a2 2 0 0 0 2 2h13M8 7h7" />,
  layers: <path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 17l9 5 9-5" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 13.5a6 6 0 0 1 3.5 6.5" />
    </>
  ),
  chart: <path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3M20 16V6" />,
  inbox: <path d="M3 13h5l2 3h4l2-3h5M3 13l2.5-8h13L21 13M3 13v6h18v-6" />,
  file: <path d="M6 3h8l5 5v13H6V3ZM14 3v5h5M9 13h6M9 17h6" />,
  "file-import": <path d="M6 3h8l5 5v13H6V3ZM14 3v5h5M12 10v7m0 0-3-3m3 3 3-3" />,
  tag: (
    <>
      <path d="M3 12V4h8l9 9-8 8-9-9Z" />
      <circle cx="7.5" cy="8.5" r="1.25" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  refresh: <path d="M20 12a8 8 0 0 1-14.5 4.6M4 12a8 8 0 0 1 14.5-4.6M18 3v4.5h-4.5M6 21v-4.5h4.5" />,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5 9 15M15 9l2.5-2.5" />,
  "log-out": <path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M15 8l5 4-5 4M20 12H9" />,
  home: <path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9Z" />,
  print: <path d="M7 8V3h10v5M7 17H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-3M7 14h10v7H7v-7Z" />,
  grid: <path d="M4 4h7v7H4V4ZM13 4h7v7h-7V4ZM4 13h7v7H4v-7ZM13 13h7v7h-7v-7Z" />,
  history: <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4.5h4.5M12 8v4l3 2" />,
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5M12 17h.01" />
    </>
  ),
  store: <path d="M4 10 5.5 4h13L20 10M4 10v10h16V10M4 10a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0M10 20v-6h4v6" />,
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: 12 | 14 | 16 | 18 | 20 | 24 | 32;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={["inline-flex shrink-0", className].filter(Boolean).join(" ")}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        {PATHS[name]}
      </svg>
    </span>
  );
}
