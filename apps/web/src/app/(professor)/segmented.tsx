// The segmented look for a row of state buttons (decision 0102): the same
// sunken track and lifted current segment as the link-based SegmentedNav, for
// the two professor surfaces whose choice is client state rather than a URL
// (the submissions filter, the scan-or-original toggle). Classes only, so a
// client island can put them on a real button with aria-pressed.
export const segmentTrackClassName =
  "inline-flex max-w-full gap-0.5 self-start overflow-x-auto rounded-lg bg-surface-sunken p-1";

export function segmentClassName(current: boolean): string {
  return (
    "inline-flex min-h-8 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap " +
    "transition-[background-color,color,box-shadow] duration-(--motion-duration) ease-(--motion-ease) " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
    "disabled:opacity-50 disabled:pointer-events-none " +
    (current ? "bg-surface font-medium text-ink shadow-raised" : "text-ink-muted hover:text-ink")
  );
}
