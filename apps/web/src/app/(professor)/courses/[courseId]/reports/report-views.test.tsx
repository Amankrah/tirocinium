import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Schemas } from "@/lib/api/client";
import {
  ActivityReport,
  AgreementReport,
  HealthReport,
  UsageReport,
} from "./report-views";

function seat(
  over: Partial<Schemas["SeatActivity"]> = {},
): Schemas["SeatActivity"] {
  return {
    seat_number: "014",
    status: "active",
    submissions: 3,
    graded: 1,
    defences: 2,
    last_submitted_at: 1_700_000_000,
    last_used_at: 1_700_000_000,
    ...over,
  };
}

describe("the activity report", () => {
  it("lists every seat in the order the backend gave, never re-sorted by volume", () => {
    // The backend orders by seat number on purpose (decision 0048): a report
    // sorted by who did most is the ranking the mastery spec rules out.
    render(
      <ActivityReport
        activity={{
          seat_count: 3,
          active_seats: 2,
          total_submissions: 9,
          seats: [
            seat({ seat_number: "014", submissions: 1 }),
            seat({ seat_number: "015", submissions: 8 }),
            seat({ seat_number: "016", submissions: 0, last_submitted_at: null }),
          ],
        }}
      />,
    );
    const rows = screen.getAllByRole("rowheader").map((cell) => cell.textContent);
    expect(rows).toEqual(["014", "015", "016"]);
  });

  it("shows a silent seat as never, not as a blank", () => {
    render(
      <ActivityReport
        activity={{
          seat_count: 1,
          active_seats: 0,
          total_submissions: 0,
          seats: [seat({ submissions: 0, last_submitted_at: null })],
        }}
      />,
    );
    expect(screen.getByText("Never")).toBeTruthy();
  });

  it("invites the next action when a course has no seats", () => {
    render(
      <ActivityReport
        activity={{ seat_count: 0, active_seats: 0, total_submissions: 0, seats: [] }}
      />,
    );
    expect(
      screen.getByText("No seats yet. Generate a batch to hand out codes."),
    ).toBeTruthy();
  });
});

describe("the spend report", () => {
  const tokens: Schemas["TokenUsageRow"][] = [
    {
      kind: "transcription",
      model_id: "claude-x",
      calls: 12,
      input_tokens: 4000,
      output_tokens: 800,
      cost: null,
    },
  ];

  it("says a cost is unpriced rather than drawing a zero", () => {
    render(
      <UsageReport
        usage={{
          priced: false,
          since: null,
          tokens,
          speech: [],
          total_cost: null,
          total_input_tokens: 4000,
          total_output_tokens: 800,
        }}
      />,
    );
    expect(
      screen.getByText(
        "No prices are configured, so this shows real usage without costs. Set them to see money.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Not priced")).toBeTruthy();
    // The usage itself is real and shown.
    expect(screen.getByText("4,000")).toBeTruthy();
  });

  it("shows the cost when one is configured", () => {
    render(
      <UsageReport
        usage={{
          priced: true,
          since: null,
          tokens: [{ ...tokens[0]!, cost: 1.5 }],
          speech: [],
          total_cost: 1.5,
          total_input_tokens: 4000,
          total_output_tokens: 800,
        }}
      />,
    );
    expect(screen.getByText("1.50")).toBeTruthy();
    expect(screen.queryByText("Not priced")).toBeNull();
  });

  it("reports speech in the provider's own unit", () => {
    render(
      <UsageReport
        usage={{
          priced: false,
          since: null,
          tokens: [],
          speech: [
            {
              kind: "tts",
              provider: "cartesia",
              calls: 4,
              amount: 320,
              unit: "characters",
              cost: null,
            },
          ],
          total_cost: null,
          total_input_tokens: 0,
          total_output_tokens: 0,
        }}
      />,
    );
    expect(screen.getByText("320 characters")).toBeTruthy();
  });

  it("says plainly when nothing has been spent", () => {
    render(
      <UsageReport
        usage={{
          priced: true,
          since: null,
          tokens: [],
          speech: [],
          total_cost: null,
          total_input_tokens: 0,
          total_output_tokens: 0,
        }}
      />,
    );
    expect(screen.getByText("Nothing has been spent on this course yet.")).toBeTruthy();
  });
});

describe("the product-health report", () => {
  function health(
    recognition: Partial<Schemas["RecognitionHealth"]> = {},
    verification: Partial<Schemas["VerificationHealth"]> = {},
  ): Schemas["app__reports__routes__HealthOut"] {
    return {
      recognition: {
        pages_read: 40,
        mean_confidence: 0.82,
        rejected_pages: 0,
        buckets: [
          { lower: 0, upper: 0.1, count: 0 },
          { lower: 0.9, upper: 1, count: 30 },
        ],
        ...recognition,
      },
      verification: {
        pass_rate: 0.9,
        verified: 18,
        flagged: 2,
        manual: 1,
        ...verification,
      },
    };
  }

  it("reports the confidence distribution and its mean", () => {
    render(<HealthReport health={health()} />);
    expect(screen.getByText("Mean 82% across 40 pages.")).toBeTruthy();
    expect(screen.getByText("30 pages")).toBeTruthy();
    expect(screen.getByText("90 to 100%")).toBeTruthy();
  });

  it("says nothing has been read rather than drawing an empty distribution", () => {
    render(
      <HealthReport
        health={health({ pages_read: 0, mean_confidence: null, buckets: [] })}
      />,
    );
    expect(screen.getByText("No pages have been read yet.")).toBeTruthy();
  });

  it("names rejected pages, since they are the ones a professor may need to chase", () => {
    render(<HealthReport health={health({ rejected_pages: 3 })} />);
    expect(screen.getByText("3 pages were rejected as unreadable.")).toBeTruthy();
  });

  it("refuses to state a pass rate with no machine-verified variants", () => {
    render(
      <HealthReport
        health={health({}, { pass_rate: null, verified: 0, flagged: 0, manual: 4 })}
      />,
    );
    expect(
      screen.getByText(
        "No variants have been machine-verified yet, so there is no pass rate to report.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("0% passed")).toBeNull();
  });
});

describe("the rubric-agreement report", () => {
  function agreement(
    over: Partial<Schemas["RubricAgreementOut"]> = {},
  ): Schemas["RubricAgreementOut"] {
    return {
      pairs: 12,
      mean_grade: 0.72,
      mean_rubric_score: 0.78,
      mean_signed_difference: 0.06,
      mean_absolute_difference: 0.11,
      correlation: 0.64,
      generated_at: 1_700_000_000,
      ...over,
    };
  }

  it("names which way a difference runs, rather than leaving a sign to be read", () => {
    render(<AgreementReport agreement={agreement()} />);
    expect(screen.getByText("+6 points")).toBeTruthy();
    expect(
      screen.getByText("Positive means the tutor read more generously than you did."),
    ).toBeTruthy();
  });

  it("says the tutor read more harshly when the difference is negative", () => {
    render(<AgreementReport agreement={agreement({ mean_signed_difference: -0.09 })} />);
    expect(
      screen.getByText("Negative means the tutor read more harshly than you did."),
    ).toBeTruthy();
  });

  // The whole point of decision 0048's null rule: an empty denominator must
  // never render as a number that reads like a finding.
  it("renders every empty statistic as not enough yet, never as zero", () => {
    render(
      <AgreementReport
        agreement={agreement({
          pairs: 0,
          mean_grade: null,
          mean_rubric_score: null,
          mean_signed_difference: null,
          mean_absolute_difference: null,
          correlation: null,
        })}
      />,
    );
    expect(screen.getAllByText("Not enough yet")).toHaveLength(5);
    expect(screen.getByText("From 0 pairs.")).toBeTruthy();
    expect(screen.queryByText("0%")).toBeNull();
    expect(screen.queryByText("0.00")).toBeNull();
  });

  it("reports a correlation that exists to two places", () => {
    render(<AgreementReport agreement={agreement({ correlation: 0.6432 })} />);
    expect(screen.getByText("0.64")).toBeTruthy();
  });
});
