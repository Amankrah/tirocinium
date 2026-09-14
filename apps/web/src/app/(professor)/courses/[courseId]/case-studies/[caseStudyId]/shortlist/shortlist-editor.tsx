"use client";

// The shortlist editor (Phase 10, decision 0062). The professor picks the lines
// a case study puts forward first, in the order they want them considered.
//
// Two things this surface will not do. It will not hide a material: a shortlist
// narrows what a student meets first and never restricts what they can reach,
// because deciding a material is wrong is the exercise. And it will not show a
// student's price. Each line carries its list price and the band a struck price
// falls in, because per-variant pricing only means something while nobody else
// holds the number a given seat is holding.
//
// The whole catalogue arrives in one response, so filtering here is honest
// client-side work rather than a page-boundary illusion.
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { Result } from "@/lib/api/client";
import type {
  AuthoringCatalogue,
  AuthoringLine,
  Shortlist,
} from "@/lib/api/marketplace-authoring";
import { money } from "@/lib/money";
import { strings } from "../../../../../strings";

// The backend's own ceiling; a longer list is a catalogue, not a shortlist.
const MAX = 40;

// Below this the band is narrower than a cent or two either way, and calling it
// a range would overstate what a student will actually see move.
const STEADY = 0.02;

const s = strings.shortlist;

export function ShortlistEditor({
  courseId,
  caseStudyId,
  catalogue,
  initial,
  save,
}: {
  courseId: number;
  caseStudyId: number;
  catalogue: AuthoringCatalogue;
  initial: string[];
  save: (
    courseId: number,
    caseStudyId: number,
    skus: string[],
  ) => Promise<Result<Shortlist>>;
}) {
  const [chosen, setChosen] = useState<string[]>(initial);
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState("");
  const [saved, setSaved] = useState(false);
  const [dropped, setDropped] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const bySku = useMemo(() => {
    const map = new Map<string, AuthoringLine>();
    for (const line of catalogue.lines) map.set(line.sku, line);
    return map;
  }, [catalogue.lines]);

  const picked = useMemo(() => new Set(chosen), [chosen]);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return catalogue.lines.filter((line) => {
      if (supplier && line.supplier_id !== supplier) return false;
      if (category && line.category !== category) return false;
      if (!needle) return true;
      return [line.name, line.spec, line.sku, ...line.tags]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [catalogue.lines, search, supplier, category]);

  function change(next: string[]) {
    setChosen(next);
    setSaved(false);
  }

  function add(sku: string) {
    if (picked.has(sku) || chosen.length >= MAX) return;
    change([...chosen, sku]);
  }

  function remove(sku: string) {
    change(chosen.filter((entry) => entry !== sku));
  }

  function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= chosen.length) return;
    const next = [...chosen];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) return;
    next.splice(target, 0, moved);
    change(next);
  }

  function onSave() {
    startTransition(async () => {
      const result = await save(courseId, caseStudyId, chosen);
      if (result.ok) {
        setChosen(result.data.skus);
        setDropped(result.data.dropped);
        setSaved(true);
        setFailed(false);
      } else {
        setFailed(true);
        setSaved(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="chosen" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="chosen" className="font-display text-2xl">
            {s.chosenHeading}
          </h2>
          <p className="text-sm text-ink-muted">{s.order}</p>
        </div>

        {chosen.length === 0 ? (
          <p className="text-ink-muted">{s.chosenEmpty}</p>
        ) : (
          <ol className="flex flex-col divide-y divide-rule-line">
            {chosen.map((sku, index) => {
              const line = bySku.get(sku);
              return (
                <li
                  key={sku}
                  className="flex flex-wrap items-center justify-between gap-4 py-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <span>{line?.name ?? sku}</span>
                    <span className="font-mono text-xs text-ink-muted">
                      {sku}
                      {line ? ` · ${line.supplier_name}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      label={`${s.moveUp}: ${line?.name ?? sku}`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </IconButton>
                    <IconButton
                      label={`${s.moveDown}: ${line?.name ?? sku}`}
                      disabled={index === chosen.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </IconButton>
                    <button
                      type="button"
                      onClick={() => remove(sku)}
                      className="rounded-md px-2 py-1 text-xs text-ink-muted underline hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {s.remove}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={onSave} disabled={pending}>
            {s.save}
          </Button>
          {saved ? (
            <p role="status" className="text-sm text-verify-green">
              {s.saved}
            </p>
          ) : null}
          {failed ? (
            <p role="alert" className="text-sm text-flag-amber">
              {s.error}
            </p>
          ) : null}
        </div>
        {dropped.length > 0 ? (
          <p className="text-sm text-flag-amber">{s.dropped(dropped.join(", "))}</p>
        ) : null}
        {chosen.length >= MAX ? (
          <p className="text-sm text-ink-muted">{s.full(MAX)}</p>
        ) : null}
      </section>

      <section aria-labelledby="catalogue" className="flex flex-col gap-4">
        <h2 id="catalogue" className="font-display text-2xl">
          {s.catalogueHeading}
        </h2>

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="sr-only">{s.search}</span>
            <input
              type="search"
              value={search}
              aria-label={s.search}
              placeholder={s.searchPlaceholder}
              onChange={(event) => setSearch(event.currentTarget.value)}
              className="min-w-48 rounded-md border border-rule-line bg-transparent px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>

          <select
            aria-label={s.allSuppliers}
            value={supplier}
            onChange={(event) => setSupplier(event.currentTarget.value)}
            className={SELECT}
          >
            <option value="">{s.allSuppliers}</option>
            {catalogue.suppliers.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>

          <select
            aria-label={s.allCategories}
            value={category}
            onChange={(event) => setCategory(event.currentTarget.value)}
            className={SELECT}
          >
            <option value="">{s.allCategories}</option>
            {catalogue.categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {matches.length === 0 ? (
          <p className="text-sm text-ink-muted">{s.noResults}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {matches.map((line) => (
              <LineCard
                key={line.sku}
                line={line}
                chosen={picked.has(line.sku)}
                atCapacity={chosen.length >= MAX}
                onAdd={() => add(line.sku)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const SELECT =
  "rounded-md border border-rule-line bg-transparent px-3 py-2 text-sm " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md px-2 py-1 text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 disabled:pointer-events-none"
    >
      {children}
    </button>
  );
}

function LineCard({
  line,
  chosen,
  atCapacity,
  onAdd,
}: {
  line: AuthoringLine;
  chosen: boolean;
  atCapacity: boolean;
  onAdd: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-rule-line p-4">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{line.name}</span>
        <span className="text-xs text-ink-muted">{line.spec}</span>
        <span className="text-xs text-ink-muted">{line.supplier_name}</span>
      </div>

      <div className="flex flex-col gap-0.5 font-mono text-sm tabular-nums">
        <span>{s.listPrice(money(line.list_price_cents), line.unit_label)}</span>
        <span className="text-xs text-ink-muted">
          {line.volatility < STEADY
            ? s.steady
            : s.band(money(line.band_low_cents), money(line.band_high_cents))}
        </span>
      </div>

      {line.service ? (
        <span className="text-xs text-ink-muted">{s.service}</span>
      ) : null}

      <div className="mt-auto pt-2">
        {/* The label leads with the visible word and then names the line, so a
            screen reader hears which material it would add while the button
            still reads as what it says (WCAG 2.5.3). */}
        <Button
          onClick={onAdd}
          disabled={chosen || atCapacity}
          aria-label={`${chosen ? s.added : s.add}: ${line.name}`}
          className="text-sm"
        >
          {chosen ? s.added : s.add}
        </Button>
      </div>
    </li>
  );
}
