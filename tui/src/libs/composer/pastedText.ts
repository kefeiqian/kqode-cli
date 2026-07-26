import { expandTabs } from '@libs/text/expandTabs.ts';

const CARRIAGE_RETURN_PATTERN = /\r\n?/g;
const PASTE_CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/** Normalizes pasted layout and strips terminal control bytes. */
export function sanitizePastedText(text: string): string {
  return expandTabs(
    text.replace(CARRIAGE_RETURN_PATTERN, '\n').replace(PASTE_CONTROL_CHAR_PATTERN, '')
  );
}
