"use client";

// One submission under review (guide 4.4, milestone 8.1, decision 0059): the
// page beside its reading, with each region's box drawn on the image, hover and
// focus linking the two directions, low confidence marked in both, and the
// grade. A client island: hover-linking, the image toggle, the presigned reload,
// and the grade form are all interaction.
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../../../../strings";

const s = strings.submissions;

// The same line the student sees on their own upload, so both audiences read
// "less certain" at the same threshold.
const LOW_CONFIDENCE = 0.6;

// A region's bbox is `[x0, y0, x1, y1]`, normalised 0..1 with a top-left origin:
// the shape the handwriting-transcription prompt specifies, which is the
// contract the model is held to. Note this is the opposite convention from a
// figure's bbox (`[x, y, w, h]`, decision 0032), so the two overlays cannot
// share a helper. Pure, so the arithmetic is tested without a layout.
export function regionRect(bbox: number[]): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = bbox;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const left = clamp(Math.min(x0, x1));
  const top = clamp(Math.min(y0, y1));
  // Rounded, because binary subtraction of two normalised values otherwise puts
  // a dozen meaningless digits into the style attribute.
  const percent = (v: number) => `${Math.round(v * 10_000) / 100}%`;
  return {
    left: percent(left),
    top: percent(top),
    width: percent(clamp(Math.max(x0, x1)) - left),
    height: percent(clamp(Math.max(y0, y1)) - top),
  };
}

type RefreshAction = (
  courseId: number,
  submissionId: number,
  pageIndex: number,
) => Promise<Schemas["PageRenditionsOut"] | null>;

type GradeAction = (
  courseId: number,
  submissionId: number,
  score: number,
) => Promise<Schemas["GradeOut"] | null>;

export function SubmissionReview({
  courseId,
  review,
  refresh,
  grade,
}: {
  courseId: number;
  review: Schemas["SubmissionReviewOut"];
  refresh: RefreshAction;
  grade: GradeAction;
}) {
  const [linked, setLinked] = useState<string | null>(null);
  const [originals, setOriginals] = useState<Record<number, boolean>>({});
  const [urls, setUrls] = useState<Record<number, Schemas["PageRenditionsOut"]>>({});
  const [failed, setFailed] = useState<Record<number, boolean>>({});

  async function reload(pageIndex: number) {
    const fresh = await refresh(courseId, review.id, pageIndex);
    if (fresh) {
      setUrls((prev) => ({ ...prev, [pageIndex]: fresh }));
      setFailed((prev) => ({ ...prev, [pageIndex]: false }));
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <GradeForm
        courseId={courseId}
        submissionId={review.id}
        current={review.grade}
        grade={grade}
      />

      {review.pages.length === 0 ? (
        <p className="text-ink-muted">{s.notRead}</p>
      ) : (
        <p className="max-w-prose text-sm text-ink-muted">{s.lowConfidenceNote}</p>
      )}

      {review.pages.map((page) => {
        const fresh = urls[page.page_index];
        const showOriginal = originals[page.page_index] === true;
        const rendition = fresh?.grayscale_url ?? page.grayscale_url;
        const original = fresh?.image_url ?? page.image_url;
        // Boxes only line up on the rendition the model read, so the original
        // is shown unboxed rather than with boxes that would be a prettier lie.
        const imageUrl = showOriginal ? original : (rendition ?? original);
        const boxed = !showOriginal && rendition !== null;

        return (
          <section
            key={page.page_index}
            className="flex flex-col gap-3 border-t border-rule-line pt-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl">{s.pageLabel(page.page_index + 1)}</h2>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={showOriginal ? "quiet" : "primary"}
                  aria-pressed={!showOriginal}
                  disabled={rendition === null}
                  onClick={() =>
                    setOriginals((prev) => ({ ...prev, [page.page_index]: false }))
                  }
                >
                  {s.showRendition}
                </Button>
                <Button
                  variant={showOriginal ? "primary" : "quiet"}
                  aria-pressed={showOriginal}
                  onClick={() =>
                    setOriginals((prev) => ({ ...prev, [page.page_index]: true }))
                  }
                >
                  {s.showOriginal}
                </Button>
              </div>
            </div>

            {page.reject_reason ? (
              <p role="status" className="text-sm text-flag-amber">
                {s.rejected(page.reject_reason)}
              </p>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-2">
                {failed[page.page_index] ? (
                  <div className="flex flex-col items-start gap-2 rounded border border-flag-amber/40 p-4">
                    <p className="text-sm text-flag-amber">{s.imageFailed}</p>
                    <Button variant="quiet" onClick={() => void reload(page.page_index)}>
                      {s.reload}
                    </Button>
                  </div>
                ) : (
                  <div className="relative overflow-hidden rounded border border-rule-line">
                    {/* A presigned URL of unknown intrinsic size, as on the
                        import surface; next/image would need a remote pattern
                        and dimensions the review read does not carry. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt=""
                      className="block h-auto w-full"
                      draggable={false}
                      onError={() =>
                        setFailed((prev) => ({ ...prev, [page.page_index]: true }))
                      }
                    />
                    {boxed
                      ? page.regions.map((region, index) => {
                          const key = `${page.page_index}:${index}`;
                          const low = region.confidence < LOW_CONFIDENCE;
                          return (
                            <span
                              key={key}
                              aria-hidden="true"
                              onMouseEnter={() => setLinked(key)}
                              onMouseLeave={() => setLinked(null)}
                              className={`absolute border-2 ${
                                linked === key
                                  ? "border-accent bg-accent/15"
                                  : low
                                    ? "border-flag-amber/70"
                                    : "border-accent/30"
                              }`}
                              style={regionRect(region.bbox)}
                            />
                          );
                        })
                      : null}
                  </div>
                )}
                {!showOriginal && rendition !== null ? (
                  <p className="text-xs text-ink-muted">{s.renditionNote}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-xs uppercase tracking-widest text-ink-muted">
                  {s.reading}
                </h3>
                {page.regions.length > 0 ? (
                  <ol className="flex flex-col gap-1">
                    {page.regions.map((region, index) => {
                      const key = `${page.page_index}:${index}`;
                      const low = region.confidence < LOW_CONFIDENCE;
                      const percent = Math.round(region.confidence * 100);
                      return (
                        <li key={key}>
                          {/* Focusable, so the link works from the keyboard as
                              well as the pointer (guide 6). */}
                          <button
                            type="button"
                            onMouseEnter={() => setLinked(key)}
                            onMouseLeave={() => setLinked(null)}
                            onFocus={() => setLinked(key)}
                            onBlur={() => setLinked(null)}
                            className={`w-full rounded px-2 py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                              linked === key ? "bg-accent/10" : ""
                            } ${low ? "text-flag-amber" : "text-ink"}`}
                          >
                            <span className="font-mono text-xs tabular-nums text-ink-muted">
                              {s.regionLabel(percent)}
                            </span>{" "}
                            {region.text}
                            {low ? (
                              <span className="ml-2 text-xs">({s.lowConfidence})</span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                ) : page.markdown ? (
                  <p className="whitespace-pre-wrap text-ink">{page.markdown}</p>
                ) : (
                  <p className="text-sm text-ink-muted">{s.noReading}</p>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function GradeForm({
  courseId,
  submissionId,
  current,
  grade,
}: {
  courseId: number;
  submissionId: number;
  current: number | null;
  grade: GradeAction;
}) {
  const [value, setValue] = useState(
    current === null ? "" : String(Math.round(current * 100)),
  );
  const [saved, setSaved] = useState<number | null>(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const percent = Number(value);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError(s.gradeRange);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await grade(courseId, submissionId, percent / 100);
    setBusy(false);
    if (result) setSaved(result.score);
    else setError(s.gradeFailed);
  }

  return (
    // noValidate so the honest line below is the one a professor reads, rather
    // than the browser's own bubble (guide 3.4); min and max stay on the input
    // for the spinner and for assistive technology.
    <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
      <h2 className="font-display text-xl">{s.gradeHeading}</h2>
      <p className="max-w-prose text-sm text-ink-muted">{s.gradeNote}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="grade-score" className="text-sm text-ink-muted">
            {s.gradeLabel}
          </label>
          <input
            id="grade-score"
            type="number"
            min={0}
            max={100}
            step={1}
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-28 rounded-md border border-field-border bg-paper px-3 py-2 font-mono tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </div>
        <Button type="submit" disabled={busy || value.trim() === ""}>
          {s.gradeAction}
        </Button>
      </div>
      <p aria-live="polite" className="min-h-6 text-sm">
        {error ? (
          <span className="text-flag-amber">{error}</span>
        ) : saved !== null ? (
          <span className="text-verify-green">{s.gradeSaved(saved)}</span>
        ) : (
          <span className="text-ink-muted">{s.ungraded}</span>
        )}
      </p>
    </form>
  );
}
