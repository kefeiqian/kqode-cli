const ESC = 0x1b;
const BEL = 0x07;
const CONTROL_MAX = 0x1f;
const DEL = 0x7f;
const C1_MAX = 0x9f;
const CSI_INTRODUCER = '['.charCodeAt(0);
const OSC_INTRODUCER = ']'.charCodeAt(0);
const ST_TERMINATOR = '\\'.charCodeAt(0);
const CSI_FINAL_MIN = 0x40;
const CSI_FINAL_MAX = 0x7e;

/** Strips C0/C1 controls plus CSI and OSC terminal escapes from model ids. */
export function sanitizeModelId(input: string): string {
  let output = '';
  let index = 0;

  while (index < input.length) {
    const codeUnit = input.charCodeAt(index);
    if (codeUnit === ESC) {
      index = skipEscape(input, index + 1);
      continue;
    }

    const codePoint = input.codePointAt(index) ?? 0;
    const char = String.fromCodePoint(codePoint);
    if (!isControl(codePoint)) {
      output += char;
    }
    index += char.length;
  }

  return output;
}

function skipEscape(input: string, index: number): number {
  const introducer = input.charCodeAt(index);
  if (introducer === OSC_INTRODUCER) {
    return skipOsc(input, index + 1);
  }
  if (introducer === CSI_INTRODUCER) {
    return skipCsi(input, index + 1);
  }
  return index;
}

function skipOsc(input: string, index: number): number {
  while (index < input.length) {
    if (input.charCodeAt(index) === BEL) {
      return index + 1;
    }
    if (input.charCodeAt(index) === ESC && input.charCodeAt(index + 1) === ST_TERMINATOR) {
      return index + 2;
    }
    index += 1;
  }
  return index;
}

function skipCsi(input: string, index: number): number {
  while (index < input.length) {
    const byte = input.charCodeAt(index);
    if (byte >= CSI_FINAL_MIN && byte <= CSI_FINAL_MAX) {
      return index + 1;
    }
    index += 1;
  }
  return index;
}

function isControl(codePoint: number): boolean {
  return codePoint <= CONTROL_MAX || (codePoint >= DEL && codePoint <= C1_MAX);
}
