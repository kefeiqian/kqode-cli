import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App.tsx';
import {
  columnsTestOverrideAtom,
  FULLSCREEN_GUARD_ROWS,
  productVersionAtom,
  rowsTestOverrideAtom,
  workspaceCwdAtom
} from '@state/global/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const workspaceCwd = 'C:\\Users\\kefeiqian\\Projects\\dummy-react-app';

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
  return renderWithJotai(<App />, store);
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
    expect(output).toContain('~\\Projects\\dummy-react-app');
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
    // One row is reserved below the UI to keep frames under fullscreen.
    expect(outputRows).toHaveLength(18 - FULLSCREEN_GUARD_ROWS);
    expect(outputRows.at(-1)).toContain('/ commands | @ mention | ? help');
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
});
