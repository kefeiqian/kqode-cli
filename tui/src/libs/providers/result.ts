/** Result shape for pure provider helpers with typed error tags. */
export type ProviderHelperResult<T, E extends string> =
  | { ok: true; value: T }
  | { ok: false; error: E; message: string };
