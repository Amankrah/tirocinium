// Client-side page pre-checks (frontend guide 4.1, step 2): catch obvious
// problems in ~100 ms on the device, before any upload round trip. The type
// allowlist and the per-page byte ceiling mirror the server's Stage 1 limits
// (app/submissions/routes.py: PageContentType and MAX_PAGE_BYTES) so a page
// this accepts would not be rejected by the API for those reasons, and the
// blur heuristic gives a student the chance to retake before uploading rather
// than after preprocessing rejects it server-side (the Rust preprocess
// `blurry` path, decision 0016).
//
// The authority on a page's readability is always the server: this is a coarse,
// deliberately lenient pre-filter that only flags the obvious, never a
// substitute for the Rust quality gate. Reasons are stable codes; the UI layer
// maps them to copy so the strings stay in the typed strings modules.

export const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "application/pdf",
] as const;

export type AcceptedType = (typeof ACCEPTED_TYPES)[number];

// Kept in lockstep with app/submissions/routes.py.
export const MAX_PAGE_BYTES = 15 * 1024 * 1024; // 15 MiB
export const MAX_PAGES = 25;

export type PageFileRejection = "type" | "too_large" | "empty";

// A file-shaped input: the fields we read, so the check is unit-testable with a
// plain object as well as a real File.
export interface PageFileLike {
  type: string;
  size: number;
}

/**
 * Validate a chosen file against the server's own accept rules. Returns a stable
 * rejection code, or null when the file is acceptable to upload.
 */
export function validatePageFile(file: PageFileLike): PageFileRejection | null {
  if (file.size <= 0) return "empty";
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > MAX_PAGE_BYTES) return "too_large";
  return null;
}

/**
 * Variance of the Laplacian over a grayscale buffer: a focused page of
 * handwriting carries strong high-frequency edges (ink strokes against paper)
 * and so a high variance, while a blurred one is smooth and scores low. Pure
 * over the pixel buffer so it is testable without a canvas; the caller supplies
 * grayscale from a downscaled `<canvas>` (the downscale keeps this within the
 * ~100 ms budget and normalizes for camera resolution).
 *
 * `gray` is one byte per pixel, row-major, length `width * height`.
 */
export function laplacianVariance(
  gray: ArrayLike<number>,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3) return 0;
  // The loop bounds keep every index in range; the coalesce satisfies the
  // strict indexed-access rule without a per-pixel branch that matters.
  const at = (index: number): number => gray[index] ?? 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      // 4-neighbour discrete Laplacian.
      const lap =
        4 * at(i) - at(i - 1) - at(i + 1) - at(i - width) - at(i + width);
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

// Calibrated against synthetic ground truth here and confirmed against real
// phone photos through the Rust corpus, not this heuristic; set low so only
// clearly out-of-focus pages trip it and a merely low-contrast page does not.
export const BLUR_VARIANCE_THRESHOLD = 100;

export type Sharpness = "sharp" | "blurry";

export function classifySharpness(
  variance: number,
  threshold = BLUR_VARIANCE_THRESHOLD,
): Sharpness {
  return variance >= threshold ? "sharp" : "blurry";
}
