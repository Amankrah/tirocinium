import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { floatToPcm16 } from "@/lib/defence/pcm";
import {
  type AudioRuntime,
  DefenceSession,
  type TransportHandlers,
} from "./defence-session";

// A socket the test drives: it records what the surface sends and hands frames
// back in whatever order the scenario needs.
class FakeTransport {
  readonly sent: (string | ArrayBuffer)[] = [];
  closed = false;
  handlers!: TransportHandlers;
  url = "";

  connect = (url: string, handlers: TransportHandlers) => {
    this.url = url;
    this.handlers = handlers;
    return {
      send: (data: string | ArrayBuffer) => this.sent.push(data),
      close: () => {
        this.closed = true;
      },
    };
  };

  async emit(message: object): Promise<void> {
    await act(async () => {
      this.handlers.onText(JSON.stringify(message));
    });
  }

  async emitAudio(samples: Float32Array): Promise<void> {
    await act(async () => {
      this.handlers.onAudio(floatToPcm16(samples).buffer as ArrayBuffer);
    });
  }

  get textFrames(): unknown[] {
    return this.sent
      .filter((frame): frame is string => typeof frame === "string")
      .map((frame) => JSON.parse(frame));
  }
}

function fakeAudio(microphoneOpens = true) {
  const runtime = {
    enqueued: [] as Float32Array[],
    flushes: 0,
    stopped: false,
    chunkSink: null as ((chunk: Int16Array) => void) | null,
    api: {} as AudioRuntime,
  };
  runtime.api = {
    enqueue: (samples) => runtime.enqueued.push(samples),
    flush: () => {
      runtime.flushes += 1;
    },
    startMicrophone: async (onChunk) => {
      runtime.chunkSink = onChunk;
      return microphoneOpens;
    },
    stop: () => {
      runtime.stopped = true;
    },
  };
  return runtime;
}

function setup(options: { microphoneOpens?: boolean } = {}) {
  const transport = new FakeTransport();
  const audio = fakeAudio(options.microphoneOpens ?? true);
  const view = render(
    <DefenceSession
      streamUrl="wss://api.test/api/v1/conversations/12/stream?token=t"
      revisit={[
        {
          conceptId: 7,
          name: "Rate conversion",
          caseStudyId: 42,
          caseStudyTitle: "Pump sizing",
        },
      ]}
      connect={transport.connect}
      createAudio={() => audio.api}
    />,
  );
  return { transport, audio, view };
}

describe("the defence session surface", () => {
  it("connects to the stream it was given and reports connecting until ready", () => {
    const { transport } = setup();
    expect(transport.url).toContain("/api/v1/conversations/12/stream");
    expect(screen.getByText("Connecting…")).toBeTruthy();
  });

  it("opens the microphone on ready and streams captured audio as binary frames", async () => {
    const { transport, audio } = setup();
    await transport.emit({ type: "ready" });

    await waitFor(() => expect(audio.chunkSink).not.toBeNull());
    expect(screen.getByText("Listening")).toBeTruthy();

    audio.chunkSink?.(new Int16Array([1, 2, 3]));
    expect(transport.sent.some((frame) => typeof frame !== "string")).toBe(true);
  });

  it("plays reply audio through the queue in arrival order", async () => {
    const { transport, audio } = setup();
    await transport.emit({ type: "ready" });
    await transport.emitAudio(new Float32Array([0.5, 0.25]));
    expect(audio.enqueued).toHaveLength(1);
    expect(audio.enqueued[0]?.length).toBe(2);
  });

  it("shows the partial while speaking, then only the committed turn", async () => {
    const { transport } = setup();
    await transport.emit({ type: "ready" });
    await transport.emit({ type: "partial", text: "so I took the average" });
    expect(screen.getByText("so I took the average")).toBeTruthy();

    await transport.emit({ type: "turn", text: "So I took the average." });
    expect(screen.queryByText("so I took the average")).toBeNull();
    expect(screen.getByText("So I took the average.")).toBeTruthy();
  });

  it("streams the reply as captions and flushes playback on barge-in, keeping what was said", async () => {
    const { transport, audio } = setup();
    await transport.emit({ type: "ready" });
    await transport.emit({ type: "turn", text: "I averaged them." });
    await transport.emit({ type: "reply_text", text: "Why the " });
    await transport.emit({ type: "reply_text", text: "average?" });
    expect(screen.getByText("Why the average?")).toBeTruthy();

    await transport.emit({ type: "interrupted" });
    // The speaker is silenced, but the words already heard stay in the record.
    expect(audio.flushes).toBe(1);
    expect(screen.getByText("Why the average?")).toBeTruthy();
    expect(screen.getByText("You spoke here.")).toBeTruthy();
  });

  it("offers the keyboard in the same words whether the microphone is refused or recognition dies", async () => {
    const refused = setup({ microphoneOpens: false });
    await refused.transport.emit({ type: "ready" });
    await waitFor(() =>
      expect(
        screen.getByText("We cannot hear you. Type your answers instead and carry on."),
      ).toBeTruthy(),
    );
    refused.view.unmount();

    const died = setup();
    await died.transport.emit({ type: "ready" });
    await died.transport.emit({ type: "speech_down" });
    expect(
      screen.getByText("We cannot hear you. Type your answers instead and carry on."),
    ).toBeTruthy();
  });

  it("keeps the typed path reachable from the first frame, not only once speech fails", async () => {
    const { transport } = setup();
    // Before ready, before any degradation: the answer field is already there.
    expect(screen.getByLabelText("Your answer")).toBeTruthy();

    await transport.emit({ type: "ready" });
    fireEvent.change(screen.getByLabelText("Your answer"), {
      target: { value: "I used the mean." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(transport.textFrames).toContainEqual({
      type: "text",
      text: "I used the mean.",
    });
  });

  it("says the tutor's voice died while the words carry on", async () => {
    const { transport } = setup();
    await transport.emit({ type: "ready" });
    await transport.emit({ type: "audio_down" });
    await transport.emit({ type: "reply_text", text: "Keep going." });

    expect(screen.getByText("The tutor's voice stopped. Its words carry on below.")).toBeTruthy();
    expect(screen.getByText("Keep going.")).toBeTruthy();
  });

  it("mentions the wind-down quietly rather than counting down", async () => {
    const { transport } = setup();
    await transport.emit({ type: "ready" });
    await transport.emit({ type: "wind_down" });
    expect(screen.getByText("The tutor is wrapping this up.")).toBeTruthy();
    // Still a live session; nothing is disabled by winding down.
    expect(screen.getByLabelText("Your answer")).toBeTruthy();
  });

  it("ends on request and then names the concept to revisit with a fresh variant", async () => {
    const { transport } = setup();
    await transport.emit({ type: "ready" });
    fireEvent.click(screen.getByRole("button", { name: "End the conversation" }));
    expect(transport.textFrames).toContainEqual({ type: "end" });

    await transport.emit({ type: "closed" });
    await transport.emit({ type: "verdict", concept_to_revisit: 7 });

    expect(screen.getByText("The conversation is over.")).toBeTruthy();
    expect(screen.getByText("Rate conversion")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Practise it" }).getAttribute("href")).toBe(
      "/course/42",
    );
    // A closed session takes no more input.
    expect(screen.queryByLabelText("Your answer")).toBeNull();
  });

  it("says plainly when a verdict names no concept", async () => {
    const { transport } = setup();
    await transport.emit({ type: "ready" });
    await transport.emit({ type: "closed" });
    await transport.emit({ type: "verdict", concept_to_revisit: null });
    expect(screen.getByText("Nothing stood out as needing another look.")).toBeTruthy();
  });

  it("distinguishes a dropped connection from a conversation that ended", async () => {
    const { transport } = setup();
    await transport.emit({ type: "ready" });
    await act(async () => {
      transport.handlers.onClosed();
    });
    expect(
      screen.getByText("The connection dropped. What you said is saved up to that point."),
    ).toBeTruthy();
  });

  it("does not report a drop when the server closed the session cleanly", async () => {
    const { transport } = setup();
    await transport.emit({ type: "ready" });
    await transport.emit({ type: "closed" });
    await act(async () => {
      transport.handlers.onClosed();
    });
    expect(screen.getByText("The conversation is over.")).toBeTruthy();
  });

  it("closes the socket and releases the microphone when the student leaves", async () => {
    const { transport, audio, view } = setup();
    await transport.emit({ type: "ready" });
    view.unmount();
    expect(transport.closed).toBe(true);
    expect(audio.stopped).toBe(true);
  });

  it("carries nothing about the student, only the seat's own words", async () => {
    const { transport, view } = setup();
    await transport.emit({ type: "ready" });
    await transport.emit({ type: "turn", text: "I averaged them." });
    await transport.emit({ type: "reply_text", text: "Why the average?" });
    // The surface addresses the speakers by role, never by name (guide 4.0).
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("Tutor")).toBeTruthy();
    // The credential in the stream URL never reaches the rendered page.
    expect(view.container.textContent).not.toContain("token");
  });
});

// The panel is what keeps the session out of the initial bundle, so its states
// are worth pinning too.
describe("the invitation before a session opens", () => {
  it("does not open a conversation until the student asks for one", async () => {
    const open = vi.fn(async () => ({ ok: true as const, streamUrl: "wss://x/s" }));
    const { DefencePanel } = await import("./defence-panel");
    render(<DefencePanel open={open} revisit={[]} />);

    expect(open).not.toHaveBeenCalled();
    expect(
      screen.getByText("Your voice is not kept. The written conversation is."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start talking" }));
    expect(open).toHaveBeenCalledOnce();
  });

  it("is honest when the course has no room, and offers no queue", async () => {
    const open = vi.fn(async () => ({ ok: false as const, reason: "busy" as const }));
    const { DefencePanel } = await import("./defence-panel");
    render(<DefencePanel open={open} revisit={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Start talking" }));
    await waitFor(() =>
      expect(
        screen.getByText(
          "Your course has as many conversations running as it can hold. Try again in a few minutes.",
        ),
      ).toBeTruthy(),
    );
  });
});
