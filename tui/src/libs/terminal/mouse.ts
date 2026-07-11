// `?1002h` = SGR button-event tracking: reports press, release, AND drag-motion
// while a button is held (a superset of `?1000h`); `?1006h` = SGR extended
// coordinates. Drag reporting drives in-app text selection; the wheel/click
// parsers are unaffected by the mode change.
export const ENABLE_SGR_MOUSE_TRACKING = '\u001B[?1002h\u001B[?1006h';
export const DISABLE_SGR_MOUSE_TRACKING = '\u001B[?1006l\u001B[?1002l';

type MouseWheelDirection = 'up' | 'down';

/** A parsed SGR mouse-wheel press with its 1-based pointer position. */
export type MouseWheelEvent = {
  direction: MouseWheelDirection;
  /** 1-based terminal row (SGR Y coordinate) the pointer was on. */
  row: number;
  /** 1-based terminal column (SGR X coordinate) the pointer was on. */
  column: number;
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
export const RIGHT_BUTTON_CODE = 2;

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

  return {
    direction,
    row: Number.parseInt(match.groups.row, 10),
    column: Number.parseInt(match.groups.column, 10)
  };
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

/**
 * Parses a right-button press (button 2, `M`) into its 1-based row/column, or
 * `null` for release, wheel, left-click, or non-mouse input.
 */
export function parseMouseRightClickEvent(input: string): MouseClickEvent | null {
  const match = SGR_MOUSE_INPUT_PATTERN.exec(input);
  if (match?.groups === undefined || match.groups.eventType !== 'M') {
    return null;
  }

  if (Number.parseInt(match.groups.buttonCode, 10) !== RIGHT_BUTTON_CODE) {
    return null;
  }

  return {
    row: Number.parseInt(match.groups.row, 10),
    column: Number.parseInt(match.groups.column, 10)
  };
}

/** The three left-button gestures that drive in-app text selection. */
export type MouseButtonEventKind = 'press' | 'drag' | 'release';

/** A parsed left-button gesture with its 1-based pointer position. */
export type MouseButtonEvent = {
  kind: MouseButtonEventKind;
  row: number;
  column: number;
};

// SGR button-code bits: low two bits pick the button (0 = left); bit 5 (32) is
// set on motion reports (a drag while a button is held).
const MOUSE_MOTION_BIT = 32;
const MOUSE_BUTTON_MASK = 0b11;

/**
 * Parses a left-button press/drag/release into a {@link MouseButtonEvent}, or
 * `null` for wheel notches, non-left buttons, or non-mouse input. A `drag` is a
 * motion report (`?1002h` sets the motion bit) while the left button is held; a
 * `release` is the `m` terminator. Modifier bits (shift/meta/ctrl) are ignored,
 * so a modified drag still selects.
 */
export function parseMouseButtonEvent(input: string): MouseButtonEvent | null {
  const match = SGR_MOUSE_INPUT_PATTERN.exec(input);
  if (match?.groups === undefined) {
    return null;
  }

  const buttonCode = Number.parseInt(match.groups.buttonCode, 10);
  // Wheel events set bit 6; they are handled by parseMouseWheelEvent.
  if ((buttonCode & WHEEL_BUTTON_OFFSET) !== 0) {
    return null;
  }
  // Only the left button drives selection.
  if ((buttonCode & MOUSE_BUTTON_MASK) !== LEFT_BUTTON_CODE) {
    return null;
  }

  const kind: MouseButtonEventKind =
    match.groups.eventType === 'm'
      ? 'release'
      : (buttonCode & MOUSE_MOTION_BIT) !== 0
        ? 'drag'
        : 'press';

  return {
    kind,
    row: Number.parseInt(match.groups.row, 10),
    column: Number.parseInt(match.groups.column, 10)
  };
}
