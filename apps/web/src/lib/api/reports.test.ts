import { afterEach, describe, expect, it, vi } from "vitest";

import { getActivity, getHealth, getRubricAgreement, getUsage } from "./reports";

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

function url(fetchMock: ReturnType<typeof stub>): string {
  return (fetchMock.mock.calls[0] as unknown as [string])[0];
}

describe("the four course reports", () => {
  it("read under the course, professor-and-owner", async () => {
    for (const [call, path] of [
      [getActivity, "/reports/activity"],
      [getHealth, "/reports/health"],
      [getRubricAgreement, "/reports/rubric-agreement"],
    ] as const) {
      const fetchMock = stub(new Response("{}"));
      await call("jwt", 3);
      expect(url(fetchMock)).toContain(`/api/v1/courses/3${path}`);
      const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer jwt");
    }
  });

  it("passes the usage window only when it was given one", async () => {
    let fetchMock = stub(new Response("{}"));
    await getUsage("jwt", 3);
    expect(url(fetchMock)).not.toContain("since");

    fetchMock = stub(new Response("{}"));
    await getUsage("jwt", 3, 1_700_000_000);
    expect(url(fetchMock)).toContain("since=1700000000");
  });

  it("carries a null statistic through rather than turning it into a zero", async () => {
    // An empty denominator reports null (decision 0048), and the client must
    // not smooth that into a number the surface would render as a finding.
    stub(
      new Response(
        JSON.stringify({
          pairs: 0,
          mean_grade: null,
          mean_rubric_score: null,
          mean_signed_difference: null,
          mean_absolute_difference: null,
          correlation: null,
          generated_at: 1,
        }),
      ),
    );
    const agreement = await getRubricAgreement("jwt", 3);
    expect(agreement?.pairs).toBe(0);
    expect(agreement?.correlation).toBeNull();
    expect(agreement?.mean_grade).toBeNull();
  });

  it("carries the unpriced flag through untouched", async () => {
    stub(
      new Response(
        JSON.stringify({
          priced: false,
          since: null,
          tokens: [],
          speech: [],
          total_cost: null,
          total_input_tokens: 12,
          total_output_tokens: 34,
        }),
      ),
    );
    const usage = await getUsage("jwt", 3);
    expect(usage?.priced).toBe(false);
    expect(usage?.total_cost).toBeNull();
    expect(usage?.total_input_tokens).toBe(12);
  });

  it("collapses a refusal and a dead network to null", async () => {
    stub(new Response("{}", { status: 403 }));
    expect(await getActivity("jwt", 3)).toBeNull();
    stub(new Error("offline"));
    expect(await getHealth("jwt", 3)).toBeNull();
  });
});
