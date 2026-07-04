/**
 * Message shown when a `/`-prefixed submission matches no known command.
 *
 * Only the first whitespace-delimited token of the trimmed `text` is echoed, so
 * `/nope arg1 arg2` reports `Unknown command: /nope` rather than the arguments.
 */
export function unknownCommandMessage(text: string): string {
  const token = text.trim().split(/\s+/)[0] ?? text.trim();
  return `Unknown command: ${token}`;
}
