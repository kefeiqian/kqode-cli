import { beforeEach, describe, expect, it } from 'vitest';
import {
  captureComposerSubmit,
  resetSubmitCaptureForTests,
  SubmitCaptureKind,
  subscribeComposerSubmitCapture
} from '@libs/composer/submitCapture.ts';

describe('submitCapture', () => {
  beforeEach(() => {
    resetSubmitCaptureForTests();
  });

  it('funnels all submit classes exactly once in submission order', () => {
    const captured: { kind: string; text: string; sequence: number }[] = [];
    subscribeComposerSubmitCapture((submit) => captured.push(submit));

    captureComposerSubmit({ kind: SubmitCaptureKind.Prompt, text: 'hello' });
    captureComposerSubmit({ kind: SubmitCaptureKind.ValidCommand, text: '/clear' });
    captureComposerSubmit({ kind: SubmitCaptureKind.MenuCommand, text: '/help' });
    captureComposerSubmit({ kind: SubmitCaptureKind.UnknownCommand, text: '/hepl' });

    expect(captured).toEqual([
      { kind: SubmitCaptureKind.Prompt, text: 'hello', sequence: 0 },
      { kind: SubmitCaptureKind.ValidCommand, text: '/clear', sequence: 1 },
      { kind: SubmitCaptureKind.MenuCommand, text: '/help', sequence: 2 },
      { kind: SubmitCaptureKind.UnknownCommand, text: '/hepl', sequence: 3 }
    ]);
  });

  it('does not emit until a validated submit calls the funnel', () => {
    const captured: unknown[] = [];
    subscribeComposerSubmitCapture((submit) => captured.push(submit));

    expect(captured).toEqual([]);
  });
});
