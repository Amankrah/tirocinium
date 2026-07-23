// The browser side of the blur pre-check (frontend guide 4.1, step 2): load a
// chosen image, downscale it onto a canvas to keep the work inside the ~100 ms
// budget, read it back as grayscale, and score it with the pure heuristic in
// page-checks. Everything measurable lives in page-checks so it is unit-tested;
// this file is the thin, browser-only glue (canvas, ImageBitmap) that a headless
// test cannot exercise, so it degrades to "sharp" wherever those APIs are
// absent rather than block a page it cannot measure.
import { classifySharpness, laplacianVariance, type Sharpness } from "./page-checks";

// The long edge we downscale to before scoring: enough detail for the Laplacian
// to see ink strokes, small enough to stay cheap on a phone.
const ANALYSIS_LONG_EDGE = 400;

// PDFs and HEIC cannot be drawn to a canvas here, so they skip the blur check
// (the server's preprocessing is the authority regardless).
function isAnalyzable(type: string): boolean {
  return type === "image/jpeg" || type === "image/png";
}

export async function analyzeSharpness(file: Blob): Promise<Sharpness> {
  if (
    !isAnalyzable(file.type) ||
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined"
  ) {
    return "sharp";
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, ANALYSIS_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return "sharp";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, w, h);
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0; i < gray.length; i += 1) {
      const r = data[i * 4] ?? 0;
      const g = data[i * 4 + 1] ?? 0;
      const b = data[i * 4 + 2] ?? 0;
      // Rec. 601 luma, matching a typical grayscale conversion.
      gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    return classifySharpness(laplacianVariance(gray, w, h));
  } catch {
    return "sharp";
  }
}
