import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { strings } from "../../strings";
import { AutoApply } from "./auto-apply";

// The filter sheet (decision 0101, rethought in 0107): ticked categories,
// ticked attributes and a sort, as a plain GET form, so filtering works with
// no script at all and a filtered view is a URL a student can come back to.
// Ticks within a group are alternatives; the groups combine. Filtering
// narrows and never restricts, and "Clear filters" is always one link away.
//
// What changed in 0107, because a catalogue of thirty categories and sixteen
// attributes made the sheet taller than the screen with Apply at its foot:
// changes apply as they are ticked (AutoApply), Apply and Clear sit in a
// header that stays put while the sheet scrolls inside itself, each group
// folds past its first eight (anything ticked stays in view), the sort is one
// select rather than seven radios, and what is applied is also said above
// the results (ActiveFilters) as chips that take one filter off at a time.

export const SORTS: [string, string][] = [
  ["relevance", strings.project.sortCatalogue],
  ["price_asc", strings.marketplace.sortPriceAsc],
  ["price_desc", strings.marketplace.sortPriceDesc],
  ["per_kg_asc", strings.project.sortPerKg],
  ["density_asc", strings.project.sortDensity],
  ["yield_desc", strings.project.sortYield],
  ["carbon_asc", strings.marketplace.sortCarbon],
  ["energy_asc", strings.marketplace.sortEnergy],
  ["water_asc", strings.marketplace.sortWater],
  ["recovery_desc", strings.marketplace.sortRecovery],
  ["lead", strings.marketplace.sortLead],
];

export type Facet = { value: string; count?: number };

// How many of a group show before the fold.
const FOLD = 8;

export function list(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function sortOf(value: string | string[] | undefined): string {
  const chosen = list(value)[0] ?? "relevance";
  return SORTS.some(([key]) => key === chosen) ? chosen : "relevance";
}

type FilterState = {
  action: string;
  chosenCategories: string[];
  chosenTags: string[];
  sort: string;
  // Parameters the form must carry through, such as the search query.
  hidden?: Record<string, string>;
};

function href(
  action: string,
  hidden: Record<string, string>,
  categories: string[],
  tags: string[],
  sort: string,
): string {
  const params = new URLSearchParams(hidden);
  for (const category of categories) params.append("category", category);
  for (const tag of tags) params.append("tag", tag);
  if (sort !== "relevance") params.set("sort", sort);
  const query = params.toString();
  return query ? `${action}?${query}` : action;
}

export function Filters({
  action,
  categories,
  tags,
  chosenCategories,
  chosenTags,
  sort,
  hidden = {},
}: FilterState & { categories: Facet[]; tags: Facet[] }) {
  const p = strings.project;
  const active = chosenCategories.length + chosenTags.length + (sort !== "relevance" ? 1 : 0);
  const group = "flex flex-col gap-0.5 border-b border-rule-line px-4 py-3";
  const legend = "pb-1 text-xs font-medium tracking-wide text-ink-muted uppercase";
  const option =
    "flex min-h-7 cursor-pointer items-center gap-2.5 rounded-sm text-sm text-ink hover:text-accent-text";
  const tick =
    "size-4 shrink-0 accent-(--color-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <form
      action={action}
      method="get"
      className="flex max-h-[min(70svh,40rem)] flex-col self-start overflow-hidden rounded-lg border border-rule-line bg-surface shadow-raised lg:sticky lg:top-[calc(var(--app-header-height)+1rem)] lg:max-h-[calc(100svh-var(--app-header-height)-2rem)]"
      aria-label={p.filters}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <AutoApply />

      {/* The header stays put while the groups scroll beneath it, so Apply
          and Clear are never further away than the top of the sheet. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-rule-line bg-surface-sunken/60 px-3 py-2">
        <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap">
          <Icon name="tag" size={14} className="text-ink-muted" />
          {p.filterTitle(active)}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {active > 0 ? (
            <Link
              href={href(action, hidden, [], [], "relevance")}
              aria-label={p.clearFilters}
              className="text-xs whitespace-nowrap text-link"
            >
              {p.clearShort}
            </Link>
          ) : null}
          <Button type="submit" size="sm" variant="secondary" aria-label={p.applyFilters} className="px-2.5">
            {p.applyShort}
          </Button>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {categories.length > 0 ? (
          <fieldset className={group}>
            <legend className={legend}>{p.category}</legend>
            <Folded
              facets={categories}
              chosen={chosenCategories}
              render={(facet) => (
                <label key={facet.value} className={option}>
                  <input
                    type="checkbox"
                    name="category"
                    value={facet.value}
                    defaultChecked={chosenCategories.includes(facet.value)}
                    className={tick}
                  />
                  <span className="flex-1">{facet.value}</span>
                  {facet.count !== undefined ? (
                    <span className="font-mono text-xs tabular-nums text-ink-muted">{facet.count}</span>
                  ) : null}
                </label>
              )}
            />
          </fieldset>
        ) : null}
        {tags.length > 0 ? (
          <fieldset className={group}>
            <legend className={legend}>{p.attribute}</legend>
            <Folded
              facets={tags}
              chosen={chosenTags}
              render={(facet) => (
                <label key={facet.value} className={option}>
                  <input
                    type="checkbox"
                    name="tag"
                    value={facet.value}
                    defaultChecked={chosenTags.includes(facet.value)}
                    className={tick}
                  />
                  <span className="flex-1">{facet.value}</span>
                </label>
              )}
            />
          </fieldset>
        ) : null}
        <div className="flex flex-col gap-1.5 px-4 py-3">
          <label className="flex flex-col gap-1.5">
            <span className={legend}>{strings.marketplace.sort}</span>
            <select
              name="sort"
              defaultValue={sort}
              className="w-full min-w-0 rounded-md border border-field-border bg-surface px-2.5 py-1.5 text-sm text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-ink-muted">{p.applyHint}</p>
        </div>
      </div>
    </form>
  );
}

// The first few of a group, then the rest behind a disclosure. Anything
// ticked stays above the fold so a student can always see, and untick, what
// is filtering the grid. Native details: no script, and a ticked box inside
// a closed one still submits.
function Folded({
  facets,
  chosen,
  render,
}: {
  facets: Facet[];
  chosen: string[];
  render: (facet: Facet) => React.ReactNode;
}) {
  const p = strings.project;
  const shown = facets.filter((facet, i) => i < FOLD || chosen.includes(facet.value));
  const folded = facets.filter((facet) => !shown.includes(facet));
  return (
    <>
      {shown.map(render)}
      {folded.length > 0 ? (
        <details className="group">
          <summary className="flex min-h-7 cursor-pointer list-none items-center gap-1.5 text-sm text-link [&::-webkit-details-marker]:hidden">
            <Icon name="chevron-down" size={14} className="transition-transform group-open:rotate-180" />
            {p.showAll(facets.length)}
          </summary>
          <div className="flex flex-col gap-0.5 pt-0.5">{folded.map(render)}</div>
        </details>
      ) : null}
    </>
  );
}

// What is filtering the grid, said where the grid is: one chip per ticked
// value, each a link to the same view without it, and the sort when it is
// not the catalogue's own. Nothing when nothing is applied.
export function ActiveFilters({
  action,
  chosenCategories,
  chosenTags,
  sort,
  hidden = {},
}: FilterState) {
  const p = strings.project;
  const sortLabel = SORTS.find(([key]) => key === sort)?.[1];
  const chips: { label: string; href: string }[] = [
    ...chosenCategories.map((value) => ({
      label: value,
      href: href(action, hidden, chosenCategories.filter((c) => c !== value), chosenTags, sort),
    })),
    ...chosenTags.map((value) => ({
      label: value,
      href: href(action, hidden, chosenCategories, chosenTags.filter((t) => t !== value), sort),
    })),
  ];
  if (sort !== "relevance" && sortLabel) {
    chips.push({ label: p.sortedBy(sortLabel), href: href(action, hidden, chosenCategories, chosenTags, "relevance") });
  }
  if (chips.length === 0) return null;
  return (
    <nav aria-label={p.activeFilters} className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium tracking-wide text-ink-muted uppercase">{p.activeFilters}</span>
      <ul className="flex flex-wrap items-center gap-1.5">
        {chips.map((chip) => (
          <li key={chip.href}>
            <Link
              href={chip.href}
              aria-label={p.removeFilter(chip.label)}
              className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent-soft py-0.5 pr-1.5 pl-2.5 text-xs font-medium text-accent-text transition-colors duration-(--motion-duration) ease-(--motion-ease) hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {chip.label}
              <Icon name="x" size={12} />
            </Link>
          </li>
        ))}
        <li>
          <Link href={href(action, hidden, [], [], "relevance")} className="text-xs text-link">
            {p.clearFilters}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
