// The processing-stream proxy (decision 0019). The browser opens this
// same-origin route with EventSource, which sends the httpOnly seat cookie the
// client cannot read; the handler reads it, calls the backend's SSE endpoint
// with the token as a bearer credential, and pipes the event stream straight
// back. This keeps the seat token server-side while giving the client a live
// feed. A seat that owns the submission streams; anyone else gets the backend's
// 404, unchanged.
import { cookies } from "next/headers";

import { apiBaseUrl } from "@/lib/api/client";
import { SEAT_COOKIE } from "@/lib/api/session";

// Never cache or statically optimise a stream.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string }> },
): Promise<Response> {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) {
    return new Response(null, { status: 404 });
  }

  const token = (await cookies()).get(SEAT_COOKIE)?.value;
  if (!token) return new Response(null, { status: 401 });

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/api/v1/submissions/${id}/events`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "text/event-stream",
      },
      cache: "no-store",
    });
  } catch {
    return new Response(null, { status: 502 });
  }

  if (!upstream.ok || upstream.body === null) {
    return new Response(null, { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
