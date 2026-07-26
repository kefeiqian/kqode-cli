/** Clipboard operations exposed to the TUI runtime. */
export type ClipboardClient = {
  /** Returns `null` when clipboard text cannot be read. */
  readText(): Promise<string | null>;
  /** Returns `false` when `text` cannot be written. */
  writeText(text: string): Promise<boolean>;
};
