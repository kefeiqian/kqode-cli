import { utf8ByteLength } from '@libs/text/utf8.ts';

export const PROMPT_MAX_BYTES = 64 * 1024;

const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/g;
const CSI_KEY_INPUT_PATTERN = /^(?:\u001B\[|\u009B|\[)[0-?]*[ -/]*[@-~]$/;
const SS3_KEY_INPUT_PATTERN = /^\u001BO[ -~]$/;

type SubmitValidation =
  | { ok: true; text: string }
  | { ok: false; reason: 'empty' | 'over-limit'; message: string };

export function printableInput(input: string): string {
  if (isTerminalKeySequence(input)) {
    return '';
  }

  return input.replace(CONTROL_CHAR_PATTERN, '');
}

/**
 * Validates a composer submit and returns the text that should actually be sent
 * and queued. Leading and trailing whitespace (including newlines) is trimmed, so
 * both the backend submit and the local prompt queue receive the trimmed text;
 * interior whitespace is preserved. The empty and byte-limit checks apply to the
 * trimmed value.
 */
export function validateComposerSubmit(
  text: string,
  maxBytes = PROMPT_MAX_BYTES
): SubmitValidation {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      reason: 'empty',
      message: ''
    };
  }

  const limitMessage = overLimitMessage(trimmed, maxBytes);
  if (limitMessage !== null) {
    return {
      ok: false,
      reason: 'over-limit',
      message: limitMessage
    };
  }

  return {
    ok: true,
    text: trimmed
  };
}

export function overLimitMessage(text: string, maxBytes: number): string | null {
  const byteLength = utf8ByteLength(text);
  if (byteLength <= maxBytes) {
    return null;
  }

  return `Prompt is ${byteLength} bytes; maximum is ${maxBytes} bytes.`;
}

function isTerminalKeySequence(input: string): boolean {
  return CSI_KEY_INPUT_PATTERN.test(input) || SS3_KEY_INPUT_PATTERN.test(input);
}
