// The reply's playback queue (frontend guide 2: "a small audio-playback queue
// for the streamed reply"). Audio arrives chunk by chunk while the tutor is
// still speaking, so it must play strictly in arrival order and stop dead on
// barge-in: the server decides a reply was interrupted, and the client's job is
// to flush what it has not yet played rather than to decide locally.
//
// The sink is injected, so the ordering and flush rules are tested without Web
// Audio; the browser implementation lives beside this in audio-context.ts.

export interface PlayingSound {
  // Resolves when the chunk finishes playing, or immediately when stopped.
  finished: Promise<void>;
  stop(): void;
}

export interface AudioSink {
  play(samples: Float32Array): PlayingSound;
}

export class PlaybackQueue {
  private queue: Float32Array[] = [];
  private current: PlayingSound | null = null;
  private drainTask: Promise<void> | null = null;

  constructor(private readonly sink: AudioSink) {}

  get pending(): number {
    return this.queue.length;
  }

  get playing(): boolean {
    return this.current !== null;
  }

  enqueue(samples: Float32Array): void {
    this.queue.push(samples);
    if (this.drainTask === null) {
      this.drainTask = this.drain().finally(() => {
        this.drainTask = null;
      });
    }
  }

  // Barge-in: stop what is sounding and drop what has not been heard. The
  // transcript keeps the fragment that was already spoken; this only silences
  // the speaker.
  flush(): void {
    this.queue = [];
    this.current?.stop();
    this.current = null;
  }

  // Everything queued has been played. Used when the session closes so the last
  // words are not cut off by teardown.
  async drained(): Promise<void> {
    while (this.drainTask !== null) await this.drainTask;
  }

  private async drain(): Promise<void> {
    try {
      for (;;) {
        const next = this.queue.shift();
        if (next === undefined) return;
        const sound = this.sink.play(next);
        this.current = sound;
        await sound.finished;
        if (this.current === sound) this.current = null;
      }
    } finally {
      this.current = null;
    }
  }
}
