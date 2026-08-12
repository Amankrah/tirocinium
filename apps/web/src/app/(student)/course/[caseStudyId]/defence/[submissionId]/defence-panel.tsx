"use client";

// The invitation, and the one click that opens a session (decision 0055). A
// small client island: it holds nothing but which of four states the surface is
// in, and it is what keeps the audio module out of every route's initial
// JavaScript, because the session only arrives through next/dynamic once a
// student has actually decided to talk.
//
// Opening runs on the click rather than on page load because it consumes one of
// the course's capped live conversations, and a page view is not a decision.
import dynamic from "next/dynamic";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { strings } from "../../../../strings";
import type { OpenDefenceResult } from "./actions";
import type { RevisitTarget } from "./defence-session";

const DefenceSession = dynamic(() =>
  import("./defence-session").then((m) => m.DefenceSession),
);

const s = strings.defence;

type Phase = "invite" | "opening" | "live" | "failed";

export function DefencePanel({
  open,
  revisit,
  // A step sent in from the understanding unfold, carried through to the
  // session's answer box (guide 4.2).
  initialQuestion = "",
}: {
  open: () => Promise<OpenDefenceResult>;
  revisit: RevisitTarget[];
  initialQuestion?: string;
}) {
  const [phase, setPhase] = useState<Phase>("invite");
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<string>(s.unavailable);

  const start = async () => {
    setPhase("opening");
    const result = await open();
    if (result.ok) {
      setStreamUrl(result.streamUrl);
      setPhase("live");
      return;
    }
    setFailure(result.reason === "busy" ? s.busy : s.unavailable);
    setPhase("failed");
  };

  if (phase === "live" && streamUrl !== null) {
    return (
      <DefenceSession
        streamUrl={streamUrl}
        revisit={revisit}
        initialQuestion={initialQuestion}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-muted">{s.intro}</p>
      <p className="text-sm text-ink-muted">{s.privacy}</p>
      <div>
        <Button onClick={() => void start()} disabled={phase === "opening"}>
          {s.start}
        </Button>
      </div>
      <p aria-live="polite" className="min-h-6 text-sm text-flag-amber">
        {phase === "opening" ? (
          <span className="text-ink-muted">{s.opening}</span>
        ) : phase === "failed" ? (
          failure
        ) : null}
      </p>
    </div>
  );
}
