import { describe, expect, it } from "vitest";

import { type AudioSink, PlaybackQueue, type PlayingSound } from "./playback";

// A sink that plays nothing and finishes only when the test says so, which is
// what makes ordering and barge-in assertable without Web Audio.
class FakeSink implements AudioSink {
  readonly played: number[] = [];
  readonly stopped: number[] = [];
  private resolvers: (() => void)[] = [];

  play(samples: Float32Array): PlayingSound {
    const marker = samples[0] ?? 0;
    this.played.push(marker);
    let resolve!: () => void;
    const finished = new Promise<void>((r) => {
      resolve = r;
    });
    this.resolvers.push(resolve);
    return {
      finished,
      stop: () => {
        this.stopped.push(marker);
        resolve();
      },
    };
  }

  // Finish the chunk currently sounding.
  finishOne(): Promise<void> {
    this.resolvers.shift()?.();
    return Promise.resolve();
  }
}

function chunk(marker: number): Float32Array {
  return new Float32Array([marker, 0, 0]);
}

describe("PlaybackQueue", () => {
  it("plays chunks strictly in arrival order, one at a time", async () => {
    const sink = new FakeSink();
    const queue = new PlaybackQueue(sink);

    queue.enqueue(chunk(1));
    queue.enqueue(chunk(2));
    queue.enqueue(chunk(3));
    await Promise.resolve();

    // Only the first is sounding; the rest wait.
    expect(sink.played).toEqual([1]);
    expect(queue.pending).toBe(2);

    await sink.finishOne();
    await Promise.resolve();
    expect(sink.played).toEqual([1, 2]);

    await sink.finishOne();
    await Promise.resolve();
    expect(sink.played).toEqual([1, 2, 3]);
  });

  it("stops the sounding chunk and drops the unheard ones on barge-in", async () => {
    const sink = new FakeSink();
    const queue = new PlaybackQueue(sink);
    queue.enqueue(chunk(1));
    queue.enqueue(chunk(2));
    queue.enqueue(chunk(3));
    await Promise.resolve();

    queue.flush();
    await Promise.resolve();
    await Promise.resolve();

    expect(sink.stopped).toEqual([1]);
    expect(sink.played).toEqual([1]);
    expect(queue.pending).toBe(0);
    expect(queue.playing).toBe(false);
  });

  it("plays the next reply normally after a flush", async () => {
    const sink = new FakeSink();
    const queue = new PlaybackQueue(sink);
    queue.enqueue(chunk(1));
    await Promise.resolve();
    queue.flush();
    await Promise.resolve();
    await Promise.resolve();

    queue.enqueue(chunk(9));
    await Promise.resolve();
    expect(sink.played).toEqual([1, 9]);
  });

  it("resolves drained only once everything queued has been heard", async () => {
    const sink = new FakeSink();
    const queue = new PlaybackQueue(sink);
    queue.enqueue(chunk(1));
    queue.enqueue(chunk(2));

    let done = false;
    const waiting = queue.drained().then(() => {
      done = true;
    });

    await Promise.resolve();
    expect(done).toBe(false);
    await sink.finishOne();
    await Promise.resolve();
    expect(done).toBe(false);
    await sink.finishOne();
    await waiting;
    expect(done).toBe(true);
  });

  it("is drained immediately when nothing was ever queued", async () => {
    await expect(new PlaybackQueue(new FakeSink()).drained()).resolves.toBeUndefined();
  });
});
