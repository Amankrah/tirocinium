import { describe, expect, it } from "vitest";

import { readingLine, stepStatuses } from "./stages";

const copy = {
  reading: "Reading pages…",
  readingPages: (count: number) => `Reading pages 1 to ${count}`,
  readingPageOf: (done: number, count: number) => `Reading page ${done} of ${count}`,
};

describe("stepStatuses", () => {
  it("marks uploading current before the worker starts", () => {
    expect(stepStatuses("uploading", null).uploading).toBe("current");
    expect(stepStatuses("creating", null).reading).toBe("upcoming");
  });

  it("marks reading current while decode has not named a page count", () => {
    const steps = stepStatuses("processing", "opening");
    expect(steps.uploading).toBe("done");
    expect(steps.reading).toBe("current");
    expect(steps.figures).toBe("upcoming");
  });

  it("marks reading and figures current together during the page loop", () => {
    const steps = stepStatuses("processing", "reading");
    expect(steps.reading).toBe("current");
    expect(steps.figures).toBe("current");
    expect(steps.segmenting).toBe("upcoming");
  });

  it("marks finding questions current once every page is in", () => {
    const steps = stepStatuses("processing", "segmenting");
    expect(steps.reading).toBe("done");
    expect(steps.figures).toBe("done");
    expect(steps.segmenting).toBe("current");
  });
});

describe("readingLine", () => {
  it("stays uncounted until decode reports a page count", () => {
    expect(readingLine(copy, null, 0)).toBe("Reading pages…");
  });

  it("names the span once the count is known", () => {
    expect(readingLine(copy, 9, 0)).toBe("Reading pages 1 to 9");
  });

  it("names the page in progress once pages start landing", () => {
    expect(readingLine(copy, 9, 4)).toBe("Reading page 4 of 9");
  });
});
