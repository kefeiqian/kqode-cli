import os from 'node:os';
import path from 'node:path';
import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App.tsx';
import {
  activeSurfaceAtom,
  armedActionAtom,
  bodySelectionAtom,
  columnsTestOverrideAtom,
  FULLSCREEN_GUARD_ROWS,
  rowsTestOverrideAtom,
  Surface
} from '@state/ui/index.ts';
import { ArmedAction } from '@constants/ui.ts';
import { activeThemeAtom, clipboardClientAtom, productVersionAtom, workspaceCwdAtom } from '@state/global/index.ts';
import { composerStateAtom } from '@state/ui/composer/index.ts';
import { helpVisibleAtom } from '@state/ui/help/index.ts';
import { DEFAULT_THEME } from '@theme/themeConfig.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const workspaceCwd = path.join(os.homedir(), 'Projects', 'dummy-react-app');

function renderApp({ columns, rows }: { columns?: number; rows?: number } = {}) {
  const store = createStore();
  store.set(productVersionAtom, '0.1.0');
  store.set(workspaceCwdAtom, workspaceCwd);
  if (columns !== undefined) {
    store.set(columnsTestOverrideAtom, columns);
  }
  if (rows !== undefined) {
    store.set(rowsTestOverrideAtom, rows);
  }
  return { store, ...renderWithJotai(<App />, store) };
}

function deferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

async function waitForFrame(
  getFrame: () => string | undefined,
  predicate: (frame: string) => boolean
): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const frame = getFrame() ?? '';
    if (predicate(frame)) {
      return frame;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for frame. Last frame:\n${getFrame() ?? ''}`);
}

describe('App', () => {
  it('smoke renders product metadata and workspace cwd', () => {
    const { lastFrame } = renderApp({ columns: 100, rows: 20 });

    const output = lastFrame() ?? '';

    expect(output).toContain('KQode');
    expect(output).toContain('v0.1.0');
    expect(output).toContain(`~${path.sep}${path.join('Projects', 'dummy-react-app')}`);
    expect(output).not.toContain('Preview mode: local Rust backend only');
  });

  it('reflows to the latest terminal size after stdout resize events', async () => {
    const { lastFrame, stdout } = renderApp();

    await flushInput();
    Object.defineProperty(stdout, 'columns', { configurable: true, value: 80 });
    Object.defineProperty(stdout, 'rows', { configurable: true, value: 18 });
    stdout.emit('resize');
    await flushInput();

    const outputRows = (lastFrame() ?? '').split('\n');
    // The UI reserves the configured physical guard rows below the Ink canvas.
    expect(outputRows).toHaveLength(18 - FULLSCREEN_GUARD_ROWS);
    expect(outputRows.at(-1)).toContain('/ commands | @ mention');
  });

  it('shows the enlarge notice when the terminal shrinks below the usable height', async () => {
    const { lastFrame, stdout } = renderApp();

    await flushInput();
    Object.defineProperty(stdout, 'columns', { configurable: true, value: 80 });
    Object.defineProperty(stdout, 'rows', { configurable: true, value: 8 });
    stdout.emit('resize');
    await flushInput();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Terminal too small');
    expect(frame).not.toContain('/ commands');
  });

  it('shows the enlarge notice when the terminal shrinks below the usable width', async () => {
    const { lastFrame, stdout } = renderApp();

    await flushInput();
    Object.defineProperty(stdout, 'columns', { configurable: true, value: 40 });
    Object.defineProperty(stdout, 'rows', { configurable: true, value: 24 });
    stdout.emit('resize');
    await flushInput();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Terminal too small');
    expect(frame).not.toContain('/ commands');
  });

  it('restores the home screen when the terminal grows back', async () => {
    const { lastFrame, stdout } = renderApp();

    await flushInput();
    Object.defineProperty(stdout, 'columns', { configurable: true, value: 80 });
    Object.defineProperty(stdout, 'rows', { configurable: true, value: 8 });
    stdout.emit('resize');
    await flushInput();
    expect(lastFrame() ?? '').toContain('Terminal too small');

    Object.defineProperty(stdout, 'rows', { configurable: true, value: 24 });
    stdout.emit('resize');
    await flushInput();

    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('Terminal too small');
    expect(frame).toContain('/ commands');
  });

  it('preloads startup tasks on mount, locks composer input, then restores the default hints', async () => {
    const { lastFrame, stdin } = renderApp({ columns: 100, rows: 20 });

    stdin.write('blocked while loading');
    await flushInput();
    expect(lastFrame() ?? '').toContain('> blocked while loading');

    stdin.write('ready now');
    await flushInput();
    expect(lastFrame() ?? '').toContain('> blocked while loadingready now');
  });

  it('exits on the second Ctrl+C after arming on the first', async () => {
    const { store, lastFrame, stdin } = renderApp({ columns: 100, rows: 20 });
    await flushInput();

    stdin.write('\u0003');
    await flushInput();
    expect(store.get(armedActionAtom)).toBe(ArmedAction.Exit);
    expect(lastFrame() ?? '').toContain('ctrl+c again to exit');

    stdin.write('\u0003');
    await flushInput();
    expect(store.get(armedActionAtom)).toBeNull();
  });

  it('clears an active selection and arms exit on the first Ctrl+C, exiting on the second', async () => {
    const { store, stdin } = renderApp({ columns: 100, rows: 20 });
    await flushInput();

    store.set(bodySelectionAtom, {
      anchor: { rowIndex: 0, column: 0 },
      focus: { rowIndex: 0, column: 4 }
    });
    await flushInput();

    stdin.write('\u0003');
    await flushInput();

    // One Ctrl+C both dismisses the highlight and arms the exit — dismissal is
    // non-consuming, so the armed-exit logic still runs on the same press.
    expect(store.get(bodySelectionAtom)).toBeNull();
    expect(store.get(armedActionAtom)).toBe(ArmedAction.Exit);

    stdin.write('\u0003');
    await flushInput();
    expect(store.get(armedActionAtom)).toBeNull();
  });

  it('clears an active selection and still pastes on a right-click', async () => {
    const { store, stdin } = renderApp({ columns: 100, rows: 20 });
    store.set(clipboardClientAtom, {
      readText: vi.fn().mockResolvedValue('pasted'),
      writeText: vi.fn()
    });
    await flushInput();

    store.set(bodySelectionAtom, {
      anchor: { rowIndex: 0, column: 0 },
      focus: { rowIndex: 0, column: 4 }
    });
    expect(store.get(bodySelectionAtom)).not.toBeNull();

    // SGR right-button press (button 2) at column 10, row 5.
    stdin.write('\u001B[<2;10;5M');
    await flushInput();

    expect(store.get(bodySelectionAtom)).toBeNull();
    expect(store.get(composerStateAtom).text).toBe('pasted');
  });

  it('disarms a pending Ctrl+C exit on another key outside the home screen', async () => {
    const { store, stdin, stdout } = renderApp({ columns: 100, rows: 20 });
    await flushInput();

    stdin.write('\u0003');
    await flushInput();
    expect(store.get(armedActionAtom)).toBe(ArmedAction.Exit);

    Object.defineProperty(stdout, 'rows', { configurable: true, value: 8 });
    stdout.emit('resize');
    await flushInput();

    stdin.write('x');
    await flushInput();
    expect(store.get(armedActionAtom)).toBeNull();

    stdin.write('\u0003');
    await flushInput();
    expect(store.get(armedActionAtom)).toBe(ArmedAction.Exit);
  });

  it('opens the fullscreen help viewer on /help and returns home on Esc', async () => {
    const { store, lastFrame, stdin } = renderApp({ columns: 100, rows: 24 });
    await flushInput();

    stdin.write('/help');
    await flushInput();
    stdin.write('\r');
    await flushInput();

    expect(store.get(helpVisibleAtom)).toBe(true);
    const helpFrame = lastFrame() ?? '';
    expect(helpFrame).toContain('↑/↓ scroll · q/esc close');
    expect(helpFrame).toContain('COMMANDS');
    expect(helpFrame).not.toContain('/ commands | @ mention');

    stdin.write('\u001B');
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(store.get(helpVisibleAtom)).toBe(false);
    const homeFrame = lastFrame() ?? '';
    expect(homeFrame).toContain('/ commands | @ mention');
    expect(homeFrame).not.toContain('↑/↓ scroll · q/esc close');
  });

  it('opens the /theme picker from the composer and returns home on Esc without applying (covers AE1, AE5)', async () => {
    const { store, lastFrame, stdin } = renderApp({ columns: 100, rows: 24 });
    await flushInput();

    stdin.write('/theme');
    await flushInput();
    stdin.write('\r');
    await flushInput();

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Theme);
    const themeFrame = lastFrame() ?? '';
    expect(themeFrame).toContain('/theme');
    expect(themeFrame).toContain('Dracula');
    // No out-of-scope theme affordances leak into the picker.
    expect(themeFrame).not.toMatch(/light|custom|plugin|import|export/i);

    // Move the highlight off the active (default) row first, so "Esc did not
    // apply" is distinguishable from "Esc applied the highlighted theme" — an
    // Esc-applies regression would leave a non-default theme active below.
    stdin.write('\u001B[B');
    await flushInput();

    stdin.write('\u001B');
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Esc returns to the transcript without applying the highlighted theme.
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Home);
    expect(store.get(activeThemeAtom)).toBe(DEFAULT_THEME);
  });

  it('disarms Ctrl+C when Esc closes an active surface', async () => {
    const { store, stdin } = renderApp({ columns: 100, rows: 24 });
    await flushInput();

    stdin.write('/help');
    await flushInput();
    stdin.write('\r');
    await flushInput();

    stdin.write('\u0003');
    await flushInput();
    expect(store.get(armedActionAtom)).toBe(ArmedAction.Exit);

    stdin.write('\u001B');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(store.get(helpVisibleAtom)).toBe(false);
    expect(store.get(armedActionAtom)).toBeNull();

    stdin.write('\u0003');
    await flushInput();
    expect(store.get(armedActionAtom)).toBe(ArmedAction.Exit);
  });
});
