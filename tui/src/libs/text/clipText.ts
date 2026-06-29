const ELLIPSIS = '...';

export function clipTextRight(text: string, maxColumns: number): string {
  if (maxColumns <= 0) {
    return '';
  }

  if (text.length <= maxColumns) {
    return text;
  }

  if (maxColumns <= ELLIPSIS.length) {
    return text.slice(0, maxColumns);
  }

  return `${text.slice(0, maxColumns - ELLIPSIS.length)}${ELLIPSIS}`;
}

export function clipTextLeft(text: string, maxColumns: number): string {
  if (maxColumns <= 0) {
    return '';
  }

  if (text.length <= maxColumns) {
    return text;
  }

  if (maxColumns <= ELLIPSIS.length) {
    return text.slice(-maxColumns);
  }

  return `${ELLIPSIS}${text.slice(-(maxColumns - ELLIPSIS.length))}`;
}
