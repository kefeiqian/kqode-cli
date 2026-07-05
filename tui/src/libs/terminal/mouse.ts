export const ENABLE_SGR_MOUSE_TRACKING = '\u001B[?1000h\u001B[?1006h';
export const DISABLE_SGR_MOUSE_TRACKING = '\u001B[?1006l\u001B[?1000l';

type MouseWheelDirection = 'up' | 'down';

/** A parsed SGR mouse-wheel press with its 1-based pointer row. */
export type MouseWheelEvent = {
  direction: MouseWheelDirection;
  /** 1-based terminal row (SGR Y coordinate) the pointer was on. */
  row: number;
};

/** A parsed SGR left-button press with its 1-based pointer position. */
export type MouseClickEvent = {
  row: number;
  column: number;
};

// SGR mouse reports are `ESC[<button;col;row(M|m)`; col/row are 1-based.
const SGR_MOUSE_INPUT_PATTERN =
  /^(?:\u001B)?\[<(?<buttonCode>\d+);(?<column>\d+);(?<row>\d+)(?<eventType>[mM])$/;
const WHEEL_BUTTON_OFFSET = 64;
const WHEEL_BUTTON_COUNT = 4;
const LEFT_BUTTON_CODE = 0;

export function isMouseInput(input: string): boolean {
  return SGR_MOUSE_INPUT_PATTERN.test(input);
}

/**
 * Parses a wheel-button press into its direction and 1-based pointer row, or
 * `null` when `input` is not a wheel press (`M`) event. The row lets a caller
 * route the notch to whichever pane the pointer is over.
 */
export function parseMouseWheelEvent(input: string): MouseWheelEvent | null {
  const match = SGR_MOUSE_INPUT_PATTERN.exec(input);
  if (match?.groups === undefined || match.groups.eventType !== 'M') {
    return null;
  }

  const buttonCode = Number.parseInt(match.groups.buttonCode, 10);
  if (buttonCode < WHEEL_BUTTON_OFFSET) {
    return null;
  }

  // SGR mouse encodes wheel events starting at button 64; modulo strips any
  // modifier bits while keeping 0/1 as vertical wheel up/down.
  const wheelButton = (buttonCode - WHEEL_BUTTON_OFFSET) % WHEEL_BUTTON_COUNT;
  const direction = wheelButton === 0 ? 'up' : wheelButton === 1 ? 'down' : null;
  if (direction === null) {
    return null;
  }

  return { direction, row: Number.parseInt(match.groups.row, 10) };
}

/** Back-compat helper: the wheel direction only. Prefer {@link parseMouseWheelEvent}. */
export function parseMouseWheelInput(input: string): MouseWheelDirection | null {
  return parseMouseWheelEvent(input)?.direction ?? null;
}

/**
 * Parses a left-button press (button 0, `M`) into its 1-based row/column, or
 * `null` for any other event (release `m`, wheel, other buttons, or non-mouse
 * input). Lets a caller move the cursor to the click position.
 */
export function parseMouseClickEvent(input: string): MouseClickEvent | null {
  const match = SGR_MOUSE_INPUT_PATTERN.exec(input);
  if (match?.groups === undefined || match.groups.eventType !== 'M') {
    return null;
  }

  if (Number.parseInt(match.groups.buttonCode, 10) !== LEFT_BUTTON_CODE) {
    return null;
  }

  return {
    row: Number.parseInt(match.groups.row, 10),
    column: Number.parseInt(match.groups.column, 10)
  };
}
