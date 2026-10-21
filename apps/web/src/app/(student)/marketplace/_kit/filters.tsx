import Link from "next/link";

import { Button } from "@/components/ui/button";
import { strings } from "../../strings";

// The filter column (decision 0101): ticked categories, ticked attributes and
// a sort, as a plain GET form, so filtering works with no script at all and a
// filtered view is a URL a student can come back to. Ticks within a group are
// alternatives; the groups combine. Filtering narrows and never restricts,
// and "Clear filters" is always one link away.

export const SORTS: [string, string][] = [
  ["relevance", strings.project.sortCatalogue],
  ["price_asc", strings.marketplace.sortPriceAsc],
  ["price_desc", strings.marketplace.sortPriceDesc],
  ["per_kg_asc", strings.project.sortPerKg],
  ["density_asc", strings.project.sortDensity],
  ["yield_desc", strings.project.sortYield],
  ["lead", strings.marketplace.sortLead],
];

export type Facet = { value: string; count?: number };

export function list(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function sortOf(value: string | string[] | undefined): string {
  const chosen = list(value)[0] ?? "relevance";
  return SORTS.some(([key]) => key === chosen) ? chosen : "relevance";
}

export function Filters({
  action,
  categories,
  tags,
  chosenCategories,
  chosenTags,
  sort,
  hidden = {},
}: {
  action: string;
  categories: Facet[];
  tags: Facet[];
  chosenCategories: string[];
  chosenTags: string[];
  sort: string;
  // Parameters the form must carry through, such as the search query.
  hidden?: Record<string, string>;
}) {
  const p = strings.project;
  const filtered = chosenCategories.length > 0 || chosenTags.length > 0 || sort !== "relevance";
  const box = "flex flex-col gap-1.5 rounded-lg border border-rule-line p-3";
  const option = "flex items-center gap-2 text-sm";
  const tick = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <form action={action} method="get" className="flex flex-col gap-3" aria-label={p.filters}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {categories.length > 0 ? (
        <fieldset className={box}>
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
            {p.category}
          </legend>
          {categories.map((facet) => (
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
          ))}
        </fieldset>
      ) : null}
      {tags.length > 0 ? (
        <fieldset className={box}>
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
            {p.attribute}
          </legend>
          {tags.map((facet) => (
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
          ))}
        </fieldset>
      ) : null}
      <fieldset className={box}>
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
          {strings.marketplace.sort}
        </legend>
        {SORTS.map(([value, label]) => (
          <label key={value} className={option}>
            <input type="radio" name="sort" value={value} defaultChecked={sort === value} className={tick} />
            {label}
          </label>
        ))}
      </fieldset>
      <Button type="submit">{p.applyFilters}</Button>
      {filtered ? (
        <Link
          href={
            Object.keys(hidden).length > 0
              ? `${action}?${new URLSearchParams(hidden).toString()}`
              : action
          }
          className="text-center text-sm text-ink-muted underline hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {p.clearFilters}
        </Link>
      ) : null}
    </form>
  );
}
