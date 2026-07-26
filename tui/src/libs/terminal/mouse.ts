// Button-event tracking reports press, release, and drag motion while a button
// is held. Extended coordinates keep positions unambiguous on larger terminals.
export const ENABLE_SGR_MOUSE_TRACKING = '\u001B[?1002h\u001B[?1006h';
export const DISABLE_SGR_MOUSE_TRACKING = '\u001B[?1006l\u001B[?1002l';

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

export type MouseButtonEvent = MouseClickEvent & {
  kind: 'press' | 'drag' | 'release';
};

export type MouseInputEvent =
  | ({ kind: 'wheel' } & MouseWheelEvent)
  | MouseButtonEvent
  | ({ kind: 'rightClick' } & MouseClickEvent);

// SGR mouse reports are `ESC[<button;col;row(M|m)`; col/row are 1-based.
const SGR_MOUSE_INPUT_PATTERN_ALL =
  /(?:\u001B)?\[<(?<buttonCode>\d+);(?<column>\d+);(?<row>\d+)(?<eventType>[mM])/g;
const WHEEL_BUTTON_OFFSET = 64;
const WHEEL_BUTTON_COUNT = 4;
const LEFT_BUTTON_CODE = 0;
const RIGHT_BUTTON_CODE = 2;
const MOUSE_MOTION_BIT = 32;
const MOUSE_BUTTON_MASK = 0b11;

export function isMouseInput(input: string): boolean {
  return parseMouseInputEvents(input) !== null;
}

type SgrMouseGroups = {
  buttonCode: string;
  column: string;
  row: string;
  eventType: string;
};

function wheelEventFromGroups(groups: SgrMouseGroups): MouseWheelEvent | null {
  if (groups.eventType !== 'M') {
    return null;
  }

  const buttonCode = Number.parseInt(groups.buttonCode, 10);
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

  return { direction, row: Number.parseInt(groups.row, 10) };
}

/**
 * Parses a chunk made entirely of SGR mouse reports. Unsupported reports are
 * recognized but omitted from the actionable event list.
 */
export function parseMouseInputEvents(input: string): MouseInputEvent[] | null {
  if (input.length === 0) {
    return null;
  }

  const events: MouseInputEvent[] = [];
  let consumed = 0;
  for (const match of input.matchAll(SGR_MOUSE_INPUT_PATTERN_ALL)) {
    if (match.groups === undefined || match.index !== consumed) {
      return null;
    }
    const groups = match.groups as SgrMouseGroups;
    const wheel = wheelEventFromGroups(groups);
    if (wheel !== null) {
      events.push({ kind: 'wheel', ...wheel });
      consumed += match[0].length;
      continue;
    }

    const buttonCode = Number.parseInt(groups.buttonCode, 10);
    if ((buttonCode & WHEEL_BUTTON_OFFSET) !== 0) {
      consumed += match[0].length;
      continue;
    }

    const button = buttonCode & MOUSE_BUTTON_MASK;
    if (button === LEFT_BUTTON_CODE) {
      const kind: MouseButtonEvent['kind'] =
        groups.eventType === 'm'
          ? 'release'
          : (buttonCode & MOUSE_MOTION_BIT) !== 0
            ? 'drag'
            : 'press';
      events.push({
        kind,
        row: Number.parseInt(groups.row, 10),
        column: Number.parseInt(groups.column, 10)
      });
    } else if (
      groups.eventType === 'M' &&
      button === RIGHT_BUTTON_CODE &&
      (buttonCode & MOUSE_MOTION_BIT) === 0
    ) {
      events.push({
        kind: 'rightClick',
        row: Number.parseInt(groups.row, 10),
        column: Number.parseInt(groups.column, 10)
      });
    }
    consumed += match[0].length;
  }
  return consumed === input.length ? events : null;
}
