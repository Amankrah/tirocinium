"use client";

// The live defence (milestone 7.4, decision 0055). A client component because
// it holds a socket, a microphone, and an audio queue; it is loaded through
// next/dynamic from the panel, so none of this, nor the Web Audio glue it
// imports, reaches a content route.
//
// The transport and the audio runtime are injected, so the whole surface is
// driven in a test without a socket or a sound card, exactly as the upload
// controller's side-effects are.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { pcm16ToFloat } from "@/lib/defence/pcm";
import { clientFrame, parseServerMessage } from "@/lib/defence/protocol";
import {
  initialState,
  reduce,
  type SessionEvent,
  type SessionState,
} from "@/lib/defence/session";
import { strings } from "../../../../strings";

const s = strings.defence;

export interface TransportHandlers {
  onText(raw: string): void;
  onAudio(data: ArrayBuffer): void;
  onClosed(): void;
}

export interface SessionTransport {
  send(data: string | ArrayBuffer): void;
  close(): void;
}

export type ConnectTransport = (
  url: string,
  handlers: TransportHandlers,
) => SessionTransport;

export interface AudioRuntime {
  enqueue(samples: Float32Array): void;
  flush(): void;
  // Resolves false when there is no microphone to open, for any reason.
  startMicrophone(onChunk: (chunk: Int16Array) => void): Promise<boolean>;
  stop(): void;
}

export type CreateAudio = () => AudioRuntime;

// One concept the verdict may name, with the fresh variant that targets it
// (guide 4.2: defend, discover the gap, practise the gap).
export interface RevisitTarget {
  conceptId: number;
  name: string;
  caseStudyId: number | null;
  caseStudyTitle: string | null;
}

function connectWebSocket(
  url: string,
  handlers: TransportHandlers,
): SessionTransport {
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";
  socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
    if (typeof event.data === "string") handlers.onText(event.data);
    else handlers.onAudio(event.data);
  };
  socket.onclose = () => handlers.onClosed();
  socket.onerror = () => handlers.onClosed();

  const queued: (string | ArrayBuffer)[] = [];
  socket.onopen = () => {
    for (const frame of queued) socket.send(frame);
    queued.length = 0;
  };

  return {
    send(data) {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
      else if (socket.readyState === WebSocket.CONNECTING) queued.push(data);
    },
    close() {
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    },
  };
}

function createBrowserAudio(): AudioRuntime {
  // Imported lazily so a session that never reaches audio (a typed fallback on
  // a browser without Web Audio) does not construct a context at all.
  const context = new AudioContext({ sampleRate: 16_000 });
  let queue: import("@/lib/defence/playback").PlaybackQueue | null = null;
  let microphone: import("@/lib/defence/audio-context").Microphone | null = null;

  const ready = (async () => {
    const [{ PlaybackQueue }, { webAudioSink }] = await Promise.all([
      import("@/lib/defence/playback"),
      import("@/lib/defence/audio-context"),
    ]);
    queue = new PlaybackQueue(webAudioSink(context));
  })();

  const pending: Float32Array[] = [];
  return {
    enqueue(samples) {
      if (queue) queue.enqueue(samples);
      else {
        pending.push(samples);
        void ready.then(() => {
          for (const buffered of pending.splice(0)) queue?.enqueue(buffered);
        });
      }
    },
    flush() {
      pending.length = 0;
      queue?.flush();
    },
    async startMicrophone(onChunk) {
      try {
        await context.resume();
        const { openMicrophone } = await import("@/lib/defence/audio-context");
        microphone = await openMicrophone(context, onChunk);
        return microphone !== null;
      } catch {
        return false;
      }
    },
    stop() {
      microphone?.stop();
      microphone = null;
      queue?.flush();
      void context.close().catch(() => {
        // Already closed; nothing to unwind.
      });
    },
  };
}

function phaseLabel(state: SessionState): string {
  if (state.phase === "connecting") return s.connecting;
  if (state.phase === "closed") return state.lost ? s.lost : s.ended;
  if (state.phase === "speaking") return s.speaking;
  if (state.phase === "thinking") return s.thinking;
  return state.speechDown ? s.answerLabel : s.listening;
}

// The state chip (decision 0102): the accent is for the live microphone, ink
// for the tutor speaking, neutral for everything in between and after.
function phaseTone(state: SessionState): BadgeTone {
  if (state.phase === "listening" && !state.speechDown) return "accent";
  if (state.phase === "speaking") return "ink";
  return "neutral";
}

export function DefenceSession({
  streamUrl,
  revisit = [],
  // A step the student sent in from the understanding unfold (guide 4.2:
  // "I don't understand this step"). It opens the answer box already written,
  // and is theirs to edit or discard before it is sent.
  initialQuestion = "",
  connect = connectWebSocket,
  createAudio = createBrowserAudio,
}: {
  streamUrl: string;
  revisit?: RevisitTarget[];
  initialQuestion?: string;
  connect?: ConnectTransport;
  createAudio?: CreateAudio;
}) {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const [typed, setTyped] = useState(initialQuestion);
  const transportRef = useRef<SessionTransport | null>(null);
  const audioRef = useRef<AudioRuntime | null>(null);
  // A clean `closed` must not be overwritten by the socket's own close event.
  const endedRef = useRef(false);

  useEffect(() => {
    const audio = createAudio();
    audioRef.current = audio;

    const handle = (event: SessionEvent) => {
      if (event.type === "interrupted") audio.flush();
      if (event.type === "closed") endedRef.current = true;
      if (event.type === "ready") {
        void audio
          .startMicrophone((chunk) =>
            transportRef.current?.send(chunk.buffer as ArrayBuffer),
          )
          .then((opened) => {
            if (!opened) dispatch({ type: "mic_unavailable" });
          });
      }
      dispatch(event);
    };

    const transport = connect(streamUrl, {
      onText: (raw) => {
        const message = parseServerMessage(raw);
        if (message) handle(message);
      },
      onAudio: (data) => audio.enqueue(pcm16ToFloat(data)),
      onClosed: () => {
        if (!endedRef.current) dispatch({ type: "socket_lost" });
      },
    });
    transportRef.current = transport;

    return () => {
      transport.close();
      audio.stop();
      transportRef.current = null;
      audioRef.current = null;
    };
  }, [streamUrl, connect, createAudio]);

  const live = state.phase !== "closed";

  const sendTyped = useCallback(() => {
    const text = typed.trim();
    if (text === "" || !live) return;
    transportRef.current?.send(clientFrame.text(text));
    setTyped("");
  }, [typed, live]);

  const end = useCallback(() => {
    if (!live) return;
    transportRef.current?.send(clientFrame.end());
  }, [live]);

  const target =
    state.verdict?.conceptToRevisit != null
      ? revisit.find((c) => c.conceptId === state.verdict?.conceptToRevisit)
      : undefined;

  const listening = state.phase === "listening" && !state.speechDown;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={phaseTone(state)}>
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${
              listening
                ? "bg-accent motion-safe:animate-pulse"
                : state.phase === "closed"
                  ? "bg-rule-line"
                  : state.phase === "speaking"
                    ? "bg-paper"
                    : "bg-ink-muted"
            }`}
          />
          <span aria-live="polite">{phaseLabel(state)}</span>
        </Badge>
        {state.windDown ? (
          <p className="text-sm text-ink-muted">{s.windDown}</p>
        ) : null}
      </div>

      {/* The two degraded states, said once each, naming what to do instead. */}
      {state.speechDown ? (
        <p role="status" className="text-sm text-flag-amber">
          {s.speechDown}
        </p>
      ) : null}
      {state.audioDown ? (
        <p role="status" className="text-sm text-flag-amber">
          {s.audioDown}
        </p>
      ) : null}

      {/* The transcript: each turn named by role, the student's own words
          ruled in the accent, the tutor's in the hairline. */}
      <ol aria-live="polite" className="flex flex-col gap-4">
        {state.turns.map((turn) => (
          <li
            key={turn.id}
            className={`flex flex-col gap-1 border-l-2 pl-4 ${
              turn.speaker === "student" ? "border-accent" : "border-rule-line"
            }`}
          >
            <span className="text-xs font-medium tracking-wide text-ink-muted uppercase">
              {turn.speaker === "student" ? s.you : s.tutor}
            </span>
            <p className="max-w-prose text-ink">{turn.text}</p>
            {turn.interrupted ? (
              <span className="text-xs text-ink-muted">{s.interrupted}</span>
            ) : null}
          </li>
        ))}
      </ol>

      {state.partial !== "" ? (
        <p className="border-l-2 border-accent/40 pl-4 text-ink-muted italic">{state.partial}</p>
      ) : null}

      {live ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            sendTyped();
          }}
        >
          <label htmlFor="defence-answer" className="text-sm font-medium text-ink">
            {s.answerLabel}
          </label>
          <Textarea
            id="defence-answer"
            value={typed}
            rows={3}
            onChange={(event) => setTyped(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={typed.trim() === ""}>
              {s.send}
              <Icon name="arrow-right" size={16} />
            </Button>
            <Button type="button" variant="quiet" onClick={end}>
              {s.end}
            </Button>
          </div>
        </form>
      ) : null}

      {state.phase === "closed" && state.verdict ? (
        <Card as="section" tone="raised" className="flex flex-col gap-3">
          <h2 className="font-display text-xl">{s.revisitHeading}</h2>
          {target ? (
            <p className="flex flex-wrap items-center gap-3 text-ink">
              <span className="font-display text-lg">{target.name}</span>
              {target.caseStudyId !== null ? (
                <ButtonLink href={`/course/${target.caseStudyId}`} variant="secondary" size="sm">
                  {s.revisitPractise}
                  <Icon name="arrow-right" size={14} className="text-ink-muted" />
                </ButtonLink>
              ) : null}
            </p>
          ) : (
            <p className="text-ink-muted">{s.revisitNone}</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
