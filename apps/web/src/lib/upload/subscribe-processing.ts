// The browser side of the processing stream (decision 0019): open the
// same-origin proxy route with EventSource (which carries the seat cookie the
// Next handler needs, since EventSource cannot set an Authorization header),
// then parse and reduce each event and hand the state up. Thin browser glue
// over the pure model in processing.ts, so a headless test drives the model
// directly and injects a fake of this into the panel.
import {
  INITIAL_PROCESSING,
  parseProcessingEvent,
  type ProcessingState,
  reduceProcessing,
} from "./processing";

export interface ProcessingSubscription {
  close: () => void;
}

export type SubscribeProcessing = (
  submissionId: number,
  onState: (state: ProcessingState) => void,
) => ProcessingSubscription;

export const subscribeProcessing: SubscribeProcessing = (submissionId, onState) => {
  let state = INITIAL_PROCESSING;
  const source = new EventSource(`/api/submissions/${submissionId}/events`);

  source.onmessage = (event: MessageEvent<string>) => {
    const parsed = parseProcessingEvent(event.data);
    if (!parsed) return;
    state = reduceProcessing(state, parsed);
    onState(state);
    if (parsed.type === "done") source.close();
  };

  source.onerror = () => {
    // A drop after a terminal event is just the normal close; before one, the
    // live update is lost and the surface says so (a refresh re-reads status).
    if (!state.done) {
      state = { ...state, error: true };
      onState(state);
    }
    source.close();
  };

  return { close: () => source.close() };
};
