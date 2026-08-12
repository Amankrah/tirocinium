import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSubmissionReview,
  gradeSubmission,
  listSubmissions,
  refreshPage,
} from "./review";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stub(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function calledWith(fetchMock: ReturnType<typeof stub>) {
  return fetchMock.mock.calls[0] as unknown as [string, RequestInit];
}

describe("listSubmissions", () => {
  it("nests under the course and carries the professor token", async () => {
    const fetchMock = stub(
      new Response(JSON.stringify({ submissions: [], next_cursor: null }), {
        status: 200,
      }),
    );
    await listSubmissions("jwt", 3);
    const [url, init] = calledWith(fetchMock);
    expect(url).toContain("/api/v1/courses/3/submissions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer jwt");
  });

  it("passes only the filters it was given", async () => {
    const fetchMock = stub(
      new Response(JSON.stringify({ submissions: [], next_cursor: null })),
    );
    await listSubmissions("jwt", 3, { status: "processed", variantId: 9, limit: 25 });
    const [url] = calledWith(fetchMock);
    expect(url).toContain("status=processed");
    expect(url).toContain("variant_id=9");
    expect(url).toContain("limit=25");
    expect(url).not.toContain("cursor=");
  });

  it("collapses a failure and a dead network to null", async () => {
    stub(new Response("{}", { status: 403 }));
    expect(await listSubmissions("jwt", 3)).toBeNull();
    stub(new Error("offline"));
    expect(await listSubmissions("jwt", 3)).toBeNull();
  });
});

describe("getSubmissionReview", () => {
  it("reads one submission under its course", async () => {
    const detail = { id: 7, seat_number: "014", pages: [] };
    const fetchMock = stub(new Response(JSON.stringify(detail)));
    expect(await getSubmissionReview("jwt", 3, 7)).toEqual(detail);
    expect(calledWith(fetchMock)[0]).toContain("/api/v1/courses/3/submissions/7");
  });

  it("is null for another course's submission, so existence never leaks", async () => {
    stub(new Response("{}", { status: 404 }));
    expect(await getSubmissionReview("jwt", 3, 7)).toBeNull();
  });
});

describe("refreshPage", () => {
  it("reissues one page's presigned pair", async () => {
    const fetchMock = stub(
      new Response(JSON.stringify({ page_index: 2, image_url: "u", grayscale_url: "g" })),
    );
    const page = await refreshPage("jwt", 3, 7, 2);
    expect(page?.page_index).toBe(2);
    expect(calledWith(fetchMock)[0]).toContain("/submissions/7/pages/2");
  });
});

describe("gradeSubmission", () => {
  it("posts the score as the whole body", async () => {
    const fetchMock = stub(
      new Response(JSON.stringify({ submission_id: 7, score: 0.8, graded_at: 1 })),
    );
    const result = await gradeSubmission("jwt", 3, 7, 0.8);
    expect(result?.score).toBe(0.8);

    const [url, init] = calledWith(fetchMock);
    expect(url).toContain("/api/v1/courses/3/submissions/7/grade");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ score: 0.8 });
  });

  it("is null when the grade is refused, so the surface can say so", async () => {
    stub(new Response("{}", { status: 422 }));
    expect(await gradeSubmission("jwt", 3, 7, 5)).toBeNull();
  });
});
