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
export type MouseInputEvent =
  | ({ kind: 'wheel' } & MouseWheelEvent)
  | ({ kind: 'click' } & MouseClickEvent);

// SGR mouse reports are `ESC[<button;col;row(M|m)`; col/row are 1-based.
const SGR_MOUSE_INPUT_PATTERN_ALL =
  /(?:\u001B)?\[<(?<buttonCode>\d+);(?<column>\d+);(?<row>\d+)(?<eventType>[mM])/g;
const WHEEL_BUTTON_OFFSET = 64;
const WHEEL_BUTTON_COUNT = 4;
const LEFT_BUTTON_CODE = 0;

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

/** Parses one wheel-button press, or `null` for any other input. */
export function parseMouseWheelEvent(input: string): MouseWheelEvent | null {
  const events = parseMouseInputEvents(input);
  return events?.length === 1 && events[0]?.kind === 'wheel'
    ? { direction: events[0].direction, row: events[0].row }
    : null;
}

/** Parses every wheel notch in a possibly batched stdin chunk. */
export function parseMouseWheelEvents(input: string): MouseWheelEvent[] {
  const events = parseMouseInputEvents(input);
  if (events === null) {
    return [];
  }
  const wheels: MouseWheelEvent[] = [];
  for (const event of events) {
    if (event.kind !== 'wheel') {
      return [];
    }
    wheels.push({ direction: event.direction, row: event.row });
  }
  return wheels;
}

/**
 * Parses a left-button press (button 0, `M`) into its 1-based row/column, or
 * `null` for any other event (release `m`, wheel, other buttons, or non-mouse
 * input). Lets a caller move the cursor to the click position.
 */
export function parseMouseClickEvent(input: string): MouseClickEvent | null {
  const events = parseMouseInputEvents(input);
  return events?.length === 1 && events[0]?.kind === 'click'
    ? { row: events[0].row, column: events[0].column }
    : null;
}

/**
 * Parses a chunk made entirely of SGR mouse reports. Release and unsupported
 * reports are recognized but omitted from the actionable event list.
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
    } else if (
      groups.eventType === 'M' &&
      Number.parseInt(groups.buttonCode, 10) === LEFT_BUTTON_CODE
    ) {
      events.push({
        kind: 'click',
        row: Number.parseInt(groups.row, 10),
        column: Number.parseInt(groups.column, 10)
      });
    }
    consumed += match[0].length;
  }
  return consumed === input.length ? events : null;
}
