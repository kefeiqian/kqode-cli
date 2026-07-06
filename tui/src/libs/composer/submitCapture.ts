/** Default submit classes emitted by the composer capture funnel. */
export const SubmitCaptureKind = {
  Prompt: 'prompt',
  ValidCommand: 'valid-command',
  MenuCommand: 'menu-command',
  UnknownCommand: 'unknown-command'
} as const;

/** One of the composer submit classes emitted by the capture funnel. */
export type SubmitCaptureKind = (typeof SubmitCaptureKind)[keyof typeof SubmitCaptureKind];

/** A validated composer submit before it receives an ordering sequence. */
export type SubmitCaptureInput = {
  kind: SubmitCaptureKind;
  text: string;
};

/** A validated composer submit after the funnel assigns submission order. */
export type CapturedSubmit = SubmitCaptureInput & {
  sequence: number;
};

/** Consumer callback for the shared submit-capture seam. */
export type SubmitCaptureSink = (submit: CapturedSubmit) => void;

let nextSequence = 0;
const sinks = new Set<SubmitCaptureSink>();

/**
 * Records one validated composer submit and notifies subscribers in submit order.
 */
export function captureComposerSubmit(input: SubmitCaptureInput): CapturedSubmit {
  const captured = { ...input, sequence: nextSequence++ };
  for (const sink of sinks) {
    sink(captured);
  }
  return captured;
}

/** Attaches a consumer to the shared submit-capture seam. */
export function subscribeComposerSubmitCapture(sink: SubmitCaptureSink): () => void {
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
}

/** Resets singleton capture state for isolated unit tests. */
export function resetSubmitCaptureForTests(): void {
  nextSequence = 0;
  sinks.clear();
}
