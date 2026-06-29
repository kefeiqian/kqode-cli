export const ENABLE_SGR_MOUSE_TRACKING = '\u001B[?1000h\u001B[?1006h';
export const DISABLE_SGR_MOUSE_TRACKING = '\u001B[?1006l\u001B[?1000l';

type MouseWheelDirection = 'up' | 'down';

const SGR_MOUSE_INPUT_PATTERN = /^(?:\u001B)?\[<(?<buttonCode>\d+);\d+;\d+(?<eventType>[mM])$/;
const WHEEL_BUTTON_OFFSET = 64;
const WHEEL_BUTTON_COUNT = 4;

export function isMouseInput(input: string): boolean {
  return SGR_MOUSE_INPUT_PATTERN.test(input);
}

export function parseMouseWheelInput(input: string): MouseWheelDirection | null {
  const match = SGR_MOUSE_INPUT_PATTERN.exec(input);
  if (match?.groups === undefined || match.groups.eventType !== 'M') {
    return null;
  }

  const buttonCode = Number.parseInt(match.groups.buttonCode, 10);
  if (buttonCode < WHEEL_BUTTON_OFFSET) {
    return null;
  }

  const wheelButton = (buttonCode - WHEEL_BUTTON_OFFSET) % WHEEL_BUTTON_COUNT;
  if (wheelButton === 0) {
    return 'up';
  }

  if (wheelButton === 1) {
    return 'down';
  }

  return null;
}
