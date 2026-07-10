import { describe, expect, it, vi } from 'vitest';
import {
  THEME_SET_OUTCOME_SAVED,
  THEME_SET_OUTCOME_STORE_FAILED
} from '@contracts/backend/index.ts';
import type { ThemeSetResult } from '@contracts/backend/index.ts';
import { activeThemeAtom } from '@state/global/index.ts';
import { activeSurfaceAtom, Surface } from '@state/ui/index.ts';
import { themeHighlightIndexAtom, themeSaveWarningAtom } from '@state/ui/theme/index.ts';
import { DEFAULT_THEME, THEME_CATALOG, ThemeId, findTheme } from '@theme/themeConfig.ts';
import { flushInput } from '@test/flushInput.ts';
import {
  ARROW_DOWN,
  ENTER,
  clientWithSetTheme,
  deferredSetTheme,
  renderTheme,
  waitUntil
} from './testUtils.tsx';

function requireTheme(id: string) {
  const theme = findTheme(id);
  if (theme === undefined) {
    throw new Error(`expected the ${id} preset to exist`);
  }
  return theme;
}

const nord = requireTheme(ThemeId.Nord);
const secondTheme = THEME_CATALOG[1]; // the row below the default (Dracula)

describe('ThemeSurface', () => {
  it('opens without a backend and marks the active theme (covers AE1, AE5)', async () => {
    const { lastFrame, store } = renderTheme(undefined, { active: nord });
    await flushInput();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('/theme');
    expect(frame).toContain('Dracula');
    expect(frame).toContain('Nord');
    // Opens highlighted on the active theme.
    expect(store.get(themeHighlightIndexAtom)).toBe(
      THEME_CATALOG.findIndex((theme) => theme.id === nord.id)
    );
    // Active theme carries the non-color active marker.
    expect(frame).toContain(`● ${nord.label}`);
  });

  it('exposes no light/custom/plugin/import/export affordance (covers AE5)', async () => {
    const { lastFrame } = renderTheme(undefined, { active: DEFAULT_THEME });
    await flushInput();

    expect(lastFrame() ?? '').not.toMatch(/light|custom|plugin|import|export/i);
  });

  it('live-previews the highlighted theme on arrow keys without persisting', async () => {
    const client = clientWithSetTheme();
    const { stdin, store } = renderTheme(client, { active: DEFAULT_THEME });
    await flushInput();
    expect(store.get(themeHighlightIndexAtom)).toBe(0);

    stdin.write(ARROW_DOWN);
    await flushInput();

    expect(store.get(themeHighlightIndexAtom)).toBe(1);
    expect(store.get(activeThemeAtom).id).toBe(secondTheme.id); // applied for preview
    expect(client.setTheme).not.toHaveBeenCalled(); // but not persisted until Enter
  });

  it('marks the focused row with ● and moves it as you navigate', async () => {
    const { stdin, lastFrame } = renderTheme(clientWithSetTheme(), { active: DEFAULT_THEME });
    await flushInput();

    // Opens focused on the active theme.
    expect(lastFrame() ?? '').toContain(`● ${DEFAULT_THEME.label}`);

    stdin.write(ARROW_DOWN);
    await flushInput();

    const frame = lastFrame() ?? '';
    // The single selection marker follows the focused (previewed) row.
    expect(frame).toContain(`● ${secondTheme.label}`);
    expect(frame).not.toContain(`● ${DEFAULT_THEME.label}`);
  });

  it('reverts to the theme active before opening when the picker closes without saving', async () => {
    const client = clientWithSetTheme();
    const { stdin, store, unmount } = renderTheme(client, { active: DEFAULT_THEME });
    await flushInput();

    stdin.write(ARROW_DOWN);
    await flushInput();
    expect(store.get(activeThemeAtom).id).toBe(secondTheme.id); // previewed

    // The App shell closes the surface on Esc, which unmounts ThemeSurface.
    unmount();

    expect(store.get(activeThemeAtom)).toBe(DEFAULT_THEME); // reverted to the origin
    expect(client.setTheme).not.toHaveBeenCalled();
  });

  it('keeps the saved theme applied when the picker unmounts after a successful save', async () => {
    const client = clientWithSetTheme();
    const { stdin, store, unmount } = renderTheme(client, { active: DEFAULT_THEME });
    await flushInput();

    stdin.write(ARROW_DOWN);
    await flushInput();
    stdin.write(ENTER);
    await waitUntil(() => store.get(activeSurfaceAtom) === Surface.Home, 'picker closes');

    unmount();

    expect(store.get(activeThemeAtom).id).toBe(secondTheme.id); // committed, not reverted
  });

  it('keeps the confirmed theme when the picker unmounts after a failed save', async () => {
    const client = clientWithSetTheme(
      vi.fn(async (): Promise<ThemeSetResult> => ({ outcome: THEME_SET_OUTCOME_STORE_FAILED }))
    );
    const { stdin, store, unmount } = renderTheme(client, { active: DEFAULT_THEME });
    await flushInput();

    stdin.write(ARROW_DOWN);
    await flushInput();
    stdin.write(ENTER);
    await waitUntil(() => store.get(themeSaveWarningAtom) !== null, 'unsaved warning');

    // Esc after a failed save must keep the confirmed theme, matching the
    // "applied for this session" warning rather than reverting it.
    unmount();

    expect(store.get(activeThemeAtom).id).toBe(secondTheme.id);
  });

  it('keeps the saved theme when the picker unmounts before an in-flight save resolves', async () => {
    const deferred = deferredSetTheme();
    const client = clientWithSetTheme(deferred.setTheme);
    const { stdin, store, unmount } = renderTheme(client, { active: DEFAULT_THEME });
    await flushInput();

    stdin.write(ARROW_DOWN);
    await flushInput();
    stdin.write(ENTER);
    await waitUntil(() => deferred.setTheme.mock.calls.length === 1, 'save request');

    // Close before the save resolves, then let it resolve saved: the persisted
    // theme and the in-memory active theme must not diverge.
    unmount();
    deferred.resolve(0, { outcome: THEME_SET_OUTCOME_SAVED });
    await flushInput();

    expect(store.get(activeThemeAtom).id).toBe(secondTheme.id);
  });

  it('applies, persists, and closes on Enter for a saved theme (covers AE1)', async () => {
    const client = clientWithSetTheme();
    const { stdin, store } = renderTheme(client, { active: DEFAULT_THEME });
    await flushInput();

    stdin.write(ARROW_DOWN);
    await flushInput();
    stdin.write(ENTER);

    await waitUntil(() => store.get(activeSurfaceAtom) === Surface.Home, 'picker closes');
    expect(store.get(activeThemeAtom).id).toBe(secondTheme.id);
    expect(client.setTheme).toHaveBeenCalledWith(secondTheme.id);
    expect(store.get(themeSaveWarningAtom)).toBeNull();
  });

  it('keeps the applied theme and warns when saving fails (covers AE4)', async () => {
    const client = clientWithSetTheme(
      vi.fn(async (): Promise<ThemeSetResult> => ({ outcome: THEME_SET_OUTCOME_STORE_FAILED }))
    );
    const { stdin, store, lastFrame } = renderTheme(client, { active: DEFAULT_THEME });
    await flushInput();

    stdin.write(ARROW_DOWN);
    await flushInput();
    stdin.write(ENTER);

    await waitUntil(() => store.get(themeSaveWarningAtom) !== null, 'unsaved warning');
    expect(store.get(activeThemeAtom).id).toBe(secondTheme.id); // applied for the session
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Theme); // stays open
    expect(lastFrame() ?? '').toContain('saving it failed');
  });

  it('applies and warns when there is no backend seam to persist to (covers AE4)', async () => {
    const { stdin, store } = renderTheme(undefined, { active: DEFAULT_THEME });
    await flushInput();

    stdin.write(ARROW_DOWN);
    await flushInput();
    stdin.write(ENTER);

    await waitUntil(() => store.get(themeSaveWarningAtom) !== null, 'unsaved warning');
    expect(store.get(activeThemeAtom).id).toBe(secondTheme.id);
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Theme);
  });

  it('lets only the latest save result close the picker (out-of-order guard)', async () => {
    const deferred = deferredSetTheme();
    const client = clientWithSetTheme(deferred.setTheme);
    const { stdin, store } = renderTheme(client, { active: DEFAULT_THEME });
    await flushInput();

    // First selection (row 1) -> save request 0 (kept pending).
    stdin.write(ARROW_DOWN);
    await flushInput();
    stdin.write(ENTER);
    await waitUntil(() => deferred.setTheme.mock.calls.length === 1, 'first save request');

    // Second selection (row 2) -> save request 1 (kept pending).
    stdin.write(ARROW_DOWN);
    await flushInput();
    stdin.write(ENTER);
    await waitUntil(() => deferred.setTheme.mock.calls.length === 2, 'second save request');

    // Resolving the stale (first) request must NOT close the picker.
    deferred.resolve(0, { outcome: THEME_SET_OUTCOME_SAVED });
    await flushInput();
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Theme);

    // Resolving the latest (second) request closes it on the newest selection.
    deferred.resolve(1, { outcome: THEME_SET_OUTCOME_SAVED });
    await waitUntil(() => store.get(activeSurfaceAtom) === Surface.Home, 'latest save closes');
    expect(store.get(activeThemeAtom).id).toBe(THEME_CATALOG[2].id);
  });

  it('renders a blank gap row between the last theme and the footer when the panel fits', async () => {
    const { lastFrame } = renderTheme(clientWithSetTheme(), { active: DEFAULT_THEME, rows: 20 });
    await flushInput();

    const lines = (lastFrame() ?? '').split('\n');
    const footerIndex = lines.findIndex((line) => line.includes('esc close'));
    expect(footerIndex).toBeGreaterThan(0);
    // The row directly above the shortcut footer is the blank breathing-room gap.
    expect(lines[footerIndex - 1]?.trim()).toBe('');
  });

  it('caps the docked popup and scrolls the catalog at the minimum terminal height (covers AE2, AE3)', async () => {
    const { stdin, store, lastFrame } = renderTheme(clientWithSetTheme(), {
      active: DEFAULT_THEME,
      rows: 15
    });
    await flushInput();

    // At MIN_ROWS the popup caps at <= floor(15/2) = 7 rows, so the 6-entry
    // catalog cannot fully fit; navigate to the last theme and confirm it
    // scrolls into view with a position indicator.
    for (let i = 0; i < THEME_CATALOG.length - 1; i += 1) {
      stdin.write(ARROW_DOWN);
      await flushInput();
    }

    const frame = lastFrame() ?? '';
    const lastTheme = THEME_CATALOG[THEME_CATALOG.length - 1];
    expect(store.get(themeHighlightIndexAtom)).toBe(THEME_CATALOG.length - 1);
    expect(frame).toContain(lastTheme.label);
    expect(frame).toContain('more ↑');
  });
});
