import Link from "next/link";

// The wordmark: the display face at a heavy optical size, in ink on paper
// (guide 3.1). No glyph. As a link it is the way home for whichever shell it
// sits in; as plain text it is the brand on a page with no shell.
export function Wordmark({
  href,
  size = "md",
  className,
}: {
  href?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
  } as const;
  const cls = [
    "font-display font-black tracking-tight text-ink",
    sizes[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  if (href) {
    return (
      <Link href={href} className={`${cls} rounded-sm focus-ring`}>
        Tirocinium
      </Link>
    );
  }
  return <span className={cls}>Tirocinium</span>;
}
