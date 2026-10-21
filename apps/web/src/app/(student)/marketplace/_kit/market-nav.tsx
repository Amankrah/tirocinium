"use client";

// The marketplace's section strip (decision 0105): the five places a student
// goes, with the one they are in marked. The only reason this is script is
// the mark: the layout is a Server Component that does not know the path,
// and a strip that never says where you are is what made the old row of
// links read as a jumble. One hook, no state.
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/icon";
import { strings } from "../../strings";

const SECTIONS: { href: string; label: string; icon: IconName; exact?: boolean }[] = [
  { href: "/marketplace", label: strings.project.home, icon: "home", exact: true },
  { href: "/marketplace/search", label: strings.project.browse, icon: "grid" },
  { href: "/marketplace/briefs", label: strings.project.briefs, icon: "book" },
  { href: "/marketplace/guide", label: strings.project.guide, icon: "help" },
  { href: "/marketplace/sources", label: strings.project.sources, icon: "file" },
  { href: "/marketplace/request", label: strings.project.request, icon: "inbox" },
];

export function MarketNav() {
  const pathname = usePathname();
  return (
    <nav aria-label={strings.project.sections}>
      <ul className="flex gap-1 overflow-x-auto whitespace-nowrap py-1 [scrollbar-width:none]">
        {SECTIONS.map((section) => {
          const current = section.exact
            ? pathname === section.href
            : pathname.startsWith(section.href) ||
              // A supplier's store and a line belong to browsing.
              (section.href === "/marketplace/search" &&
                (pathname.startsWith("/marketplace/store") ||
                  pathname.startsWith("/marketplace/line")));
          return (
            <li key={section.href} className="shrink-0">
              <Link
                href={section.href}
                aria-current={current ? "page" : undefined}
                className={
                  "inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm " +
                  "transition-[background-color,color] duration-(--motion-duration) ease-(--motion-ease) " +
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
                  (current
                    ? "bg-accent-soft font-medium text-accent-text"
                    : "text-ink-muted hover:bg-surface-sunken hover:text-ink")
                }
              >
                <Icon name={section.icon} size={15} />
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
