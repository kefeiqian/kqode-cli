import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useRef } from 'react';
import { THEME_SET_OUTCOME_SAVED } from '@contracts/backend/index.ts';
import { applyThemeAtom, backendClientAtom } from '@state/global/index.ts';
import { themeSaveWarningAtom } from '@state/ui/theme/index.ts';
import type { ThemeDefinition } from '@theme/themeConfig.ts';

const UNSAVED_WARNING = 'Theme applied for this session, but saving it failed.';

/**
 * `/theme` confirm effect: applies the chosen theme immediately (in memory plus
 * terminal background), then persists its id. Only the latest request may close
 * the picker or set the warning, so an out-of-order save result for a superseded
 * selection can neither close the picker nor warn for a stale choice.
 *
 * `onSaved` is called only when persistence succeeds; every failure path
 * (no backend seam, save-failed/invalid outcome, or a thrown request) keeps the
 * applied theme active for the session and surfaces the unsaved warning.
 */
export function useThemeBackend(onSaved: () => void) {
  const client = useAtomValue(backendClientAtom);
  const applyTheme = useSetAtom(applyThemeAtom);
  const setWarning = useSetAtom(themeSaveWarningAtom);
  const requestVersion = useRef(0);

  const selectTheme = useCallback(
    async (theme: ThemeDefinition) => {
      const version = requestVersion.current + 1;
      requestVersion.current = version;
      // Apply first so the session reflects the choice even if saving fails.
      applyTheme(theme);
      setWarning(null);

      if (client === undefined) {
        if (requestVersion.current === version) {
          setWarning(UNSAVED_WARNING);
        }
        return;
      }

      try {
        const result = await client.setTheme(theme.id);
        if (requestVersion.current !== version) {
          return;
        }
        if (result.outcome === THEME_SET_OUTCOME_SAVED) {
          onSaved();
        } else {
          setWarning(UNSAVED_WARNING);
        }
      } catch {
        if (requestVersion.current === version) {
          setWarning(UNSAVED_WARNING);
        }
      }
    },
    [applyTheme, client, onSaved, setWarning]
  );

  return { selectTheme };
}
