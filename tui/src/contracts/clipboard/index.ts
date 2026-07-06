/** Clipboard operations exposed to TUI state and components. */
export type ClipboardClient = {
  /**
   * Reads text from the system clipboard.
   *
   * Returns `null` when the clipboard is unavailable or the read fails. An
   * empty string means the clipboard is available but currently empty.
   */
  readText(): Promise<string | null>;

  /**
   * Writes `text` to the system clipboard.
   *
   * Returns `false` when the clipboard is unavailable or the write fails.
   */
  writeText(text: string): Promise<boolean>;
};
