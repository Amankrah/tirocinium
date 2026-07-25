"use client";

// The import confirmation surface (frontend guide 4.3, "the heart of the flow").
// Each detected problem is a card: its source pages on the left with figure
// boxes drawn where the detector found them, the extracted question and solution
// on the right with figures inline at their tokens, editable before confirming.
// The AI proposes, the professor disposes: confirm copies an item to a draft,
// discard drops it. A client island driving the injected server actions; the
// items read is the source of truth, so every verb refetches.
//
// This increment covers the read, the card layout, edit, confirm, and discard.
// Merge, the figure verbs, draw-a-box, and the j/k keyboard model layer on next.
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../../../../strings";
import { PageBoxes } from "./page-boxes";

const FigureMarkdown = dynamic(() =>
  import("./figure-markdown").then((m) => m.FigureMarkdown),
);

const LOW_CONFIDENCE = 0.6;
const s = strings.confirm;

type Item = Schemas["ImportItemOut"];
type Page = Schemas["ImportPageOut"];
type Role = "essential" | "decorative";

type ConfirmAction = (
  courseId: number,
  itemId: number,
  body: Schemas["ConfirmIn"],
) => Promise<Schemas["ConfirmedOut"] | null>;
type DiscardAction = (courseId: number, itemId: number) => Promise<boolean>;
type RefetchAction = (
  courseId: number,
  importId: number,
) => Promise<Schemas["ImportItemsOut"] | null>;
type AddBoxAction = (
  courseId: number,
  itemId: number,
  body: Schemas["AddBoxIn"],
) => Promise<Schemas["FigureCreatedOut"] | null>;
type RoleAction = (
  courseId: number,
  itemId: number,
  figureId: number,
  role: Role,
) => Promise<boolean>;
type RemoveFigureAction = (
  courseId: number,
  itemId: number,
  figureId: number,
) => Promise<boolean>;
type MergeAction = (
  courseId: number,
  survivorId: number,
  sourceItemId: number,
) => Promise<Schemas["MergedOut"] | null>;

export function ConfirmReview({
  courseId,
  importId,
  initial,
  confirm,
  discard,
  refetch,
  addBox,
  setRole,
  removeFig,
  merge,
}: {
  courseId: number;
  importId: number;
  initial: Schemas["ImportItemsOut"];
  confirm: ConfirmAction;
  discard: DiscardAction;
  refetch: RefetchAction;
  addBox: AddBoxAction;
  setRole: RoleAction;
  removeFig: RemoveFigureAction;
  merge: MergeAction;
}) {
  const [items, setItems] = useState<Item[]>(initial.items);
  const [pages] = useState<Page[]>(initial.pages);
  const [editing, setEditing] = useState<number | null>(null);
  const [edits, setEdits] = useState<
    Record<number, { question_md: string; solution_md: string }>
  >({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState(false);
  // The figure the professor has selected on a source page, and how many figure
  // edits they have made per item (a 4.5 accuracy signal, sent on confirm).
  const [selectedFigure, setSelectedFigure] = useState<number | null>(null);
  const [interventions, setInterventions] = useState<Record<number, number>>({});

  const pageByIndex = useMemo(
    () => new Map(pages.map((p) => [p.page_index, p])),
    [pages],
  );

  // Low-confidence first, and confirmed items sink to the bottom.
  const ordered = useMemo(
    () =>
      [...items].sort((a, b) => {
        const ac = a.state === "confirmed" ? 1 : 0;
        const bc = b.state === "confirmed" ? 1 : 0;
        return ac - bc || a.confidence - b.confidence;
      }),
    [items],
  );

  const confirmedCount = items.filter((i) => i.state === "confirmed").length;

  // "Merge with next" folds the next problem in reading order (by id) into this
  // one, matching the backend's survivor-is-earlier rule; display order is
  // low-confidence-first, so reading order is computed separately.
  const nextOf = useMemo(() => {
    const pending = items
      .filter((i) => i.state === "pending")
      .sort((a, b) => a.id - b.id);
    const map = new Map<number, number>();
    pending.forEach((it, i) => {
      const next = pending[i + 1];
      if (next) map.set(it.id, next.id);
    });
    return map;
  }, [items]);

  async function reload() {
    const next = await refetch(courseId, importId);
    if (next) setItems(next.items);
  }

  function countIntervention(itemId: number) {
    setInterventions((prev) => ({ ...prev, [itemId]: (prev[itemId] ?? 0) + 1 }));
  }

  // Every figure verb runs, then refetches for the item's updated figures.
  async function runFigureVerb(itemId: number, verb: () => Promise<unknown>) {
    setBusy(itemId);
    setError(false);
    const outcome = await verb();
    if (outcome === false || outcome === null) setError(true);
    else countIntervention(itemId);
    setSelectedFigure(null);
    await reload();
    setBusy(null);
  }

  async function onConfirm(item: Item) {
    setBusy(item.id);
    setError(false);
    const edit = edits[item.id];
    const result = await confirm(courseId, item.id, {
      question_md: edit?.question_md ?? null,
      solution_md: edit?.solution_md ?? null,
      figure_interventions: interventions[item.id] ?? 0,
    });
    if (!result) setError(true);
    setEditing(null);
    await reload();
    setBusy(null);
  }

  async function onDiscard(item: Item) {
    setBusy(item.id);
    setError(false);
    if (!(await discard(courseId, item.id))) setError(true);
    await reload();
    setBusy(null);
  }

  async function onMerge(survivor: Item, sourceId: number) {
    setBusy(survivor.id);
    setError(false);
    if (!(await merge(courseId, survivor.id, sourceId))) setError(true);
    await reload();
    setBusy(null);
  }

  function beginEdit(item: Item) {
    setEdits((prev) => ({
      ...prev,
      [item.id]: {
        question_md: item.question_md,
        solution_md: item.solution_md ?? "",
      },
    }));
    setEditing(item.id);
  }

  if (items.length === 0) {
    return <p className="text-ink-muted">{s.empty}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink" role="status">
          {s.progress(confirmedCount, items.length)}
        </p>
        <p className="max-w-prose text-sm text-ink-muted">{s.note}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-flag-amber">
          {s.error}
        </p>
      ) : null}

      <ol className="flex flex-col gap-8">
        {ordered.map((item) => {
          const isConfirmed = item.state === "confirmed";
          const isEditing = editing === item.id;
          const isBusy = busy === item.id;
          const low = item.confidence < LOW_CONFIDENCE;
          const selectedFig =
            item.figures.find((f) => f.figure_id === selectedFigure) ?? null;
          const figurePages = [
            ...new Set(
              item.figures
                .map((f) => f.page)
                .filter((p): p is number => p !== null),
            ),
          ].sort((a, b) => a - b);

          return (
            <li
              key={item.id}
              className="flex flex-col gap-4 rounded-md border border-rule-line p-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-xl">
                  {item.title ?? s.question}
                </h2>
                <span className="text-xs text-ink-muted">
                  {s.pageSpan(item.page_span)}
                </span>
                {low && !isConfirmed ? (
                  <span className="rounded-full bg-flag-amber/15 px-2 py-0.5 text-xs text-flag-amber">
                    {s.lowConfidence}
                  </span>
                ) : null}
                {isConfirmed ? (
                  <span className="text-xs text-verify-green">{s.confirmed}</span>
                ) : null}
              </div>

              {item.notes ? (
                <p className="text-sm text-flag-amber">{item.notes}</p>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                {figurePages.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <h3 className="text-xs uppercase tracking-widest text-ink-muted">
                      {s.sourcePages}
                    </h3>
                    {!isConfirmed ? (
                      <p className="text-xs text-ink-muted">{s.figureHint}</p>
                    ) : null}
                    {figurePages.map((pageIndex) => {
                      const page = pageByIndex.get(pageIndex);
                      if (!page) return null;
                      const boxes = item.figures
                        .filter((f) => f.page === pageIndex && f.bbox)
                        .map((f) => ({
                          figureId: f.figure_id,
                          bbox: f.bbox as [number, number, number, number],
                          role: f.role,
                        }));
                      return (
                        <PageBoxes
                          key={pageIndex}
                          imageUrl={page.image_url}
                          boxes={boxes}
                          selectedId={selectedFigure}
                          onSelect={isConfirmed ? () => {} : setSelectedFigure}
                          onDraw={(bbox) =>
                            void runFigureVerb(item.id, () =>
                              addBox(courseId, item.id, {
                                page_index: pageIndex,
                                bbox,
                              }),
                            )
                          }
                        />
                      );
                    })}
                    {selectedFig ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="quiet"
                          disabled={isBusy}
                          onClick={() =>
                            void runFigureVerb(item.id, () =>
                              setRole(
                                courseId,
                                item.id,
                                selectedFig.figure_id,
                                selectedFig.role === "decorative"
                                  ? "essential"
                                  : "decorative",
                              ),
                            )
                          }
                        >
                          {selectedFig.role === "decorative"
                            ? s.markEssential
                            : s.markDecorative}
                        </Button>
                        <Button
                          variant="quiet"
                          disabled={isBusy}
                          onClick={() =>
                            void runFigureVerb(item.id, () =>
                              removeFig(courseId, item.id, selectedFig.figure_id),
                            )
                          }
                        >
                          {s.removeFigure}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex min-w-0 flex-col gap-4">
                  {isEditing ? (
                    <>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-widest text-ink-muted">
                          {s.question}
                        </span>
                        <textarea
                          value={edits[item.id]?.question_md ?? ""}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [item.id]: {
                                question_md: e.target.value,
                                solution_md: prev[item.id]?.solution_md ?? "",
                              },
                            }))
                          }
                          rows={8}
                          className="rounded-md border border-rule-line bg-paper px-3 py-2 font-mono text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-widest text-ink-muted">
                          {s.solution}
                        </span>
                        <textarea
                          value={edits[item.id]?.solution_md ?? ""}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [item.id]: {
                                question_md: prev[item.id]?.question_md ?? "",
                                solution_md: e.target.value,
                              },
                            }))
                          }
                          rows={8}
                          className="rounded-md border border-rule-line bg-paper px-3 py-2 font-mono text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <div>
                        <h3 className="mb-1 text-xs uppercase tracking-widest text-ink-muted">
                          {s.question}
                        </h3>
                        <FigureMarkdown
                          markdown={edits[item.id]?.question_md ?? item.question_md}
                          figures={item.figures}
                        />
                      </div>
                      <div>
                        <h3 className="mb-1 text-xs uppercase tracking-widest text-ink-muted">
                          {s.solution}
                        </h3>
                        {item.solution_md || edits[item.id]?.solution_md ? (
                          <FigureMarkdown
                            markdown={
                              edits[item.id]?.solution_md ?? item.solution_md ?? ""
                            }
                            figures={item.figures}
                          />
                        ) : (
                          <p className="text-sm text-ink-muted">{s.noSolution}</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-rule-line pt-3">
                {isConfirmed ? (
                  <Link
                    href={`/courses/${courseId}/case-studies/${item.case_study_id}`}
                    className="text-sm text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {s.openDraft}
                  </Link>
                ) : (
                  <>
                    <Button onClick={() => void onConfirm(item)} disabled={isBusy}>
                      {s.confirm}
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => (isEditing ? setEditing(null) : beginEdit(item))}
                      disabled={isBusy}
                    >
                      {isEditing ? s.done : s.edit}
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => void onDiscard(item)}
                      disabled={isBusy}
                    >
                      {s.discard}
                    </Button>
                    {nextOf.has(item.id) ? (
                      <Button
                        variant="quiet"
                        onClick={() => void onMerge(item, nextOf.get(item.id) ?? 0)}
                        disabled={isBusy}
                      >
                        {s.mergeNext}
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
