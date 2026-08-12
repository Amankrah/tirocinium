// The professor's submission review (milestone 8.1, decision 0047): the queue,
// the scan beside its transcription, a fresh set of presigned page URLs when the
// old ones expire, and the grade. Professor-and-owner, carrying the JWT
// server-side (decision 0012); shapes from the generated client (frontend guide
// 7).
//
// Grading is not a separate verb from evidence: the same call emits
// professor_grade into the mastery model and triggers its supersession replay,
// which is why the score is the whole body and there is nothing else to send.
import { apiBaseUrl, type Schemas } from "./client";

const base = (courseId: number) =>
  `${apiBaseUrl()}/api/v1/courses/${courseId}/submissions`;

// The review queue, newest first, cursor-paginated. `status` and `variant_id`
// narrow it; the seat number is the only thing about a student on the row.
export async function listSubmissions(
  token: string,
  courseId: number,
  options: {
    status?: string;
    variantId?: number;
    cursor?: number;
    limit?: number;
  } = {},
): Promise<Schemas["SubmissionListOut"] | null> {
  const query = new URLSearchParams();
  if (options.status) query.set("status", options.status);
  if (options.variantId != null) query.set("variant_id", String(options.variantId));
  if (options.cursor != null) query.set("cursor", String(options.cursor));
  if (options.limit != null) query.set("limit", String(options.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return read(token, `${base(courseId)}${suffix}`);
}

// One submission: per page the original scan, the grayscale rendition the model
// actually read, and the reading with its region boxes and per-region
// confidence, which is what hover-linking and the low-confidence highlighting
// are built from.
export async function getSubmissionReview(
  token: string,
  courseId: number,
  submissionId: number,
): Promise<Schemas["SubmissionReviewOut"] | null> {
  return read(token, `${base(courseId)}/${submissionId}`);
}

// Presigned URLs are short-lived and a review session outlives them, so one
// page's pair can be reissued without refetching the whole submission.
export async function refreshPage(
  token: string,
  courseId: number,
  submissionId: number,
  pageIndex: number,
): Promise<Schemas["PageRenditionsOut"] | null> {
  return read(token, `${base(courseId)}/${submissionId}/pages/${pageIndex}`);
}

// The grade, in 0..1. Emits professor_grade per mapped concept and supersedes
// the automatic evidence on those concepts in the same transaction.
export async function gradeSubmission(
  token: string,
  courseId: number,
  submissionId: number,
  score: number,
): Promise<Schemas["GradeOut"] | null> {
  const body: Schemas["GradeIn"] = { score };
  let response: Response;
  try {
    response = await fetch(`${base(courseId)}/${submissionId}/grade`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as Schemas["GradeOut"];
}

async function read<T>(token: string, url: string): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as T;
}
