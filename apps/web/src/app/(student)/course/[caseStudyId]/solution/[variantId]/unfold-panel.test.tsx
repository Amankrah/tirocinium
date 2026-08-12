import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FigureMap } from "@/components/reading/problem-body";
import type { Schemas } from "@/lib/api/client";
import { UnfoldPanel } from "./unfold-panel";

function unfold(over: Partial<Schemas["UnfoldOut"]> = {}): Schemas["UnfoldOut"] {
  return {
    variant_id: 9,
    total_steps: 3,
    steps_revealed: 1,
    gave_up: false,
    steps: [{ number: 1, markdown: "Start from the rate equation." }],
    ...over,
  };
}

type Revealed = { unfold: Schemas["UnfoldOut"]; figures: FigureMap } | null;

function setup(
  initial = unfold(),
  options: {
    defenceHref?: string | null;
    reveal?: () => Promise<Revealed>;
    // The steps already out are typeset by the Server Component and handed in
    // (decision 0068); the tests stand in for that render.
    initialRendered?: Record<number, React.ReactNode>;
  } = {},
) {
  const reveal = vi.fn(
    options.reveal ??
      (async () => ({
        unfold: unfold({
          steps_revealed: 2,
          steps: [
            { number: 1, markdown: "Start from the rate equation." },
            { number: 2, markdown: "Substitute the measured flow." },
          ],
        }),
        figures: {},
      })),
  );
  const view = render(
    <UnfoldPanel
      variantId={9}
      initial={initial}
      initialRendered={
        options.initialRendered ??
        Object.fromEntries(
          initial.steps.map((step) => [
            step.number,
            <div key={step.number}>{step.markdown}</div>,
          ]),
        )
      }
      reveal={reveal as never}
      defenceHref={
        options.defenceHref === undefined ? "/course/3/defence/7" : options.defenceHref
      }
    />,
  );
  return { reveal, view };
}

describe("the understanding unfold", () => {
  it("shows only what has been unfolded, and how far that is", () => {
    setup();
    expect(screen.getByText("Start from the rate equation.")).toBeTruthy();
    expect(screen.getByText("1 of 3 steps")).toBeTruthy();
    // The unread steps are absent from the payload, so there is nothing to leak.
    expect(screen.queryByText(/Substitute/)).toBeNull();
  });

  it("asks for the next step by absolute number, so a retry cannot rewind", async () => {
    const { reveal } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Show the next step" }));

    await waitFor(() => expect(reveal).toHaveBeenCalledWith(9, 2));
    expect(await screen.findByText("Substitute the measured flow.")).toBeTruthy();
    expect(screen.getByText("2 of 3 steps")).toBeTruthy();
  });

  it("stops offering more once the whole solution is out", () => {
    setup(
      unfold({
        steps_revealed: 3,
        total_steps: 3,
        steps: [
          { number: 1, markdown: "One" },
          { number: 2, markdown: "Two" },
          { number: 3, markdown: "Three" },
        ],
      }),
    );
    expect(screen.getByText("That is the whole solution.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show the next step" })).toBeNull();
  });

  it("keeps what it had when a reveal fails, and says so", async () => {
    setup(unfold(), { reveal: async () => null });
    fireEvent.click(screen.getByRole("button", { name: "Show the next step" }));

    await waitFor(() => expect(screen.getByText("That did not open. Try again.")).toBeTruthy());
    expect(screen.getByText("1 of 3 steps")).toBeTruthy();
  });

  it("sends a step straight into the conversation, carrying its text", () => {
    setup();
    const ask = screen.getByRole("link", { name: "Ask the tutor about this step" });
    const href = ask.getAttribute("href") ?? "";
    expect(href.startsWith("/course/3/defence/7?step=")).toBe(true);
    expect(decodeURIComponent(href.split("step=")[1] ?? "")).toBe(
      "Start from the rate equation.",
    );
  });

  it("says why a step cannot be discussed when there is no submission to read", () => {
    setup(unfold(), { defenceHref: null });
    expect(
      screen.getByText("Talking about a step needs a submission the tutor can read."),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Ask the tutor about this step" })).toBeNull();
  });

  it("notes giving up plainly, without holding it against the student", () => {
    setup(unfold({ gave_up: true }));
    expect(
      screen.getByText(
        "You opened this without attempting. Nothing about that is held against you.",
      ),
    ).toBeTruthy();
  });

  // Decision 0068: a step is typeset rather than shown as source, and that is a
  // rendering of the professor's text, not a rewriting of it. What the tutor
  // receives is the proof, because the student and the tutor have to be
  // discussing the same step.
  it("sends the source the server gave it, not what was rendered from it", () => {
    const source = "Take $\\frac{Q}{A}$, then read ![the curve](fig://4).";
    setup(unfold({ steps: [{ number: 1, markdown: source }] }));

    const href =
      screen.getByRole("link", { name: "Ask the tutor about this step" }).getAttribute("href") ??
      "";
    expect(decodeURIComponent(href.split("step=")[1] ?? "")).toBe(source);
  });

  it("typesets a revealed step instead of printing its markdown", async () => {
    const { view } = setup(unfold(), {
      // Nothing pre-rendered, so the step goes through the lazy client renderer,
      // which is the path a freshly revealed step takes.
      initialRendered: {},
      reveal: async () => ({
        unfold: unfold({
          steps_revealed: 2,
          steps: [
            { number: 1, markdown: "Start from the rate equation." },
            { number: 2, markdown: "So $e^{i\\pi} + 1 = 0$." },
          ],
        }),
        figures: {},
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Show the next step" }));

    await waitFor(() => expect(view.container.querySelector(".katex")).not.toBeNull());
    // The step is no longer printed as source. KaTeX still carries the TeX in
    // its MathML annotation, which is the accessible original and is meant to
    // be there, so this asserts on the line rather than on the substring.
    expect(screen.queryByText("So $e^{i\\pi} + 1 = 0$.")).toBeNull();
  });

  it("renders a revealed step's figure as pixels at its token position", async () => {
    const { view } = setup(unfold(), {
      initialRendered: {},
      reveal: async () => ({
        unfold: unfold({
          steps_revealed: 2,
          steps: [
            { number: 1, markdown: "Start from the rate equation." },
            { number: 2, markdown: "![The curve](fig://4)" },
          ],
        }),
        figures: {
          "4": { src: "https://storage.example/c4.png", width: 320, height: 240 },
        },
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Show the next step" }));

    const figure = await screen.findByAltText("The curve");
    expect(figure.getAttribute("width")).toBe("320");
    expect(view.container.textContent).not.toContain("fig://4");
  });
});
