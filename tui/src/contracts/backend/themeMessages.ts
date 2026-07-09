/**
 * Dependency-free wire contract for theme-preference backend requests.
 *
 * Must not import transport, `@backend`, or `@state` modules.
 */

/** Must match `THEME_GET_METHOD` in `src/protocol/themes.rs`. */
export const THEME_GET_METHOD = 'kqode.theme.get';

/** Must match `THEME_SET_METHOD` in `src/protocol/themes.rs`. */
export const THEME_SET_METHOD = 'kqode.theme.set';

/** Must match `THEME_SET_OUTCOME_SAVED` in `src/protocol/themes.rs`. */
export const THEME_SET_OUTCOME_SAVED = 'saved';

/** Must match `THEME_SET_OUTCOME_INVALID` in `src/protocol/themes.rs`. */
export const THEME_SET_OUTCOME_INVALID = 'invalid';

/** Must match `THEME_SET_OUTCOME_STORE_FAILED` in `src/protocol/themes.rs`. */
export const THEME_SET_OUTCOME_STORE_FAILED = 'storeFailed';

export type ThemeSetOutcome =
  | typeof THEME_SET_OUTCOME_SAVED
  | typeof THEME_SET_OUTCOME_INVALID
  | typeof THEME_SET_OUTCOME_STORE_FAILED;

/** Must match `ThemeGetResult` in `src/protocol/themes.rs`. */
export type ThemeGetResult = {
  themeId: string | null;
};

/** Must match `ThemeSetParams` in `src/protocol/themes.rs`. */
export type ThemeSetParams = {
  themeId: string;
};

/** Must match `ThemeSetResult` in `src/protocol/themes.rs`. */
export type ThemeSetResult = {
  outcome: ThemeSetOutcome;
};
