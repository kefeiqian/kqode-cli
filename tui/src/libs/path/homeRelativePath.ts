import { displayWidth, measureGraphemes } from '@libs/text/displayWidth.ts';

const ELLIPSIS = '…';
const MIDDLE_MARKER = '...';

export function homeRelativePath(pathValue: string, homeDir: string, maxWidth: number): string {
  const separator = preferredSeparator(pathValue, homeDir);
  const normalizedPath = normalizeSeparators(pathValue, separator);
  const normalizedHome = trimTrailingSeparator(normalizeSeparators(homeDir, separator), separator);
  const homeRelative = toHomeRelative(normalizedPath, normalizedHome, separator);

  return middleTruncate(homeRelative, separator, maxWidth);
}

function toHomeRelative(pathValue: string, homeDir: string, separator: string): string {
  if (homeDir === '') {
    return pathValue;
  }

  const comparablePath = comparable(pathValue);
  const comparableHome = comparable(homeDir);
  if (comparablePath === comparableHome) {
    return '~';
  }

  const homePrefix = `${comparableHome}${separator}`;
  if (!comparablePath.startsWith(homePrefix)) {
    return pathValue;
  }

  return `~${separator}${pathValue.slice(homeDir.length + 1)}`;
}

function middleTruncate(text: string, separator: string, maxWidth: number): string {
  const safeWidth = Math.max(1, maxWidth);
  if (displayWidth(text) <= safeWidth) {
    return text;
  }

  const leadingSeparator = text.startsWith(separator) ? separator : '';
  const segments = text.split(separator).filter((segment) => segment.length > 0);
  const head = `${leadingSeparator}${segments[0] ?? ''}`;
  const tail = segments.at(-1) ?? '';
  const marker = `${separator}${MIDDLE_MARKER}${separator}`;
  const prefix = `${head}${marker}`;
  const tailBudget = safeWidth - displayWidth(prefix);

  if (head !== '' && tail !== '' && tailBudget > 0) {
    return `${prefix}${endTruncate(tail, tailBudget)}`;
  }

  return endTruncate(text, safeWidth);
}

function endTruncate(text: string, maxWidth: number): string {
  if (displayWidth(text) <= maxWidth) {
    return text;
  }
  if (maxWidth <= 1) {
    return clipToWidth(text, maxWidth);
  }

  return `${clipToWidth(text, maxWidth - displayWidth(ELLIPSIS))}${ELLIPSIS}`;
}

function clipToWidth(text: string, width: number): string {
  let clipped = '';
  let used = 0;
  for (const grapheme of measureGraphemes(text)) {
    if (used + grapheme.width > width) {
      break;
    }
    clipped += grapheme.segment;
    used += grapheme.width;
  }
  return clipped;
}

function preferredSeparator(pathValue: string, homeDir: string): string {
  return pathValue.includes('\\') || homeDir.includes('\\') ? '\\' : '/';
}

function normalizeSeparators(pathValue: string, separator: string): string {
  return pathValue.replace(/[\\/]+/g, separator);
}

function trimTrailingSeparator(pathValue: string, separator: string): string {
  while (pathValue.length > 1 && pathValue.endsWith(separator)) {
    pathValue = pathValue.slice(0, -1);
  }
  return pathValue;
}

function comparable(pathValue: string): string {
  return process.platform === 'win32' ? pathValue.toLowerCase() : pathValue;
}
