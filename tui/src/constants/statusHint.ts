export type StatusHint = {
  text: string;
  kind?: 'loading';
};

/** Status hint shown while the backend process starts at launch. */
export const BACKEND_LOADING_HINT = {
  text: 'Loading backend',
  kind: 'loading'
} as const satisfies StatusHint;
