// Splits on hard line breaks (`\n`, normalizing `\r\n`/`\r` first) so multi-line
// backend output, errors, and prompts all keep their author-intended rows, then
// wraps each line to `columns`. The display sanitizer preserves `\n` as a real
// layout character, so newlines here are trusted content rather than escaped.
export function wrapBodyText(text: string, columns: number): string[] {
  const wrappedRows: string[] = [];
  const hardLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (const line of hardLines) {
    if (line.length === 0) {
      wrappedRows.push('');
      continue;
    }

    for (let start = 0; start < line.length; start += columns) {
      wrappedRows.push(line.slice(start, start + columns));
    }
  }

  return wrappedRows;
}
