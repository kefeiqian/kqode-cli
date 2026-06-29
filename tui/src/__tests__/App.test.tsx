import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { App } from '@/App.js';
import { flushInput } from '@test/flushInput.js';

describe('App', () => {
  it('smoke renders product metadata and workspace cwd', () => {
    const workspaceCwd = 'C:\\Users\\kefeiqian\\Projects\\dummy-react-app';
    const { lastFrame } = render(
      <App productVersion="0.1.0" workspaceCwd={workspaceCwd} columns={100} rows={20} />
    );

    const output = lastFrame() ?? '';

    expect(output).toContain('KQode');
    expect(output).toContain('v0.1.0');
    expect(output).toContain('~\\Projects\\dummy-react-app');
    expect(output).not.toContain('Preview mode: local Rust backend only');
  });

  it('reflows to the latest terminal size after stdout resize events', async () => {
    const workspaceCwd = 'C:\\Users\\kefeiqian\\Projects\\dummy-react-app';
    const { lastFrame, stdout } = render(
      <App productVersion="0.1.0" workspaceCwd={workspaceCwd} />
    );

    await flushInput();
    Object.defineProperty(stdout, 'columns', { configurable: true, value: 80 });
    Object.defineProperty(stdout, 'rows', { configurable: true, value: 18 });
    stdout.emit('resize');
    await flushInput();

    const outputRows = (lastFrame() ?? '').split('\n');
    expect(outputRows).toHaveLength(18);
    expect(outputRows.at(-1)).toContain('/ commands | @ mention | ? help');
  });

  it('keeps the layout at the minimum height when the terminal shrinks below 10 rows', async () => {
    const workspaceCwd = 'C:\\Users\\kefeiqian\\Projects\\dummy-react-app';
    const { lastFrame, stdout } = render(
      <App productVersion="0.1.0" workspaceCwd={workspaceCwd} />
    );

    await flushInput();
    Object.defineProperty(stdout, 'columns', { configurable: true, value: 80 });
    Object.defineProperty(stdout, 'rows', { configurable: true, value: 8 });
    stdout.emit('resize');
    await flushInput();

    const outputRows = (lastFrame() ?? '').split('\n');
    expect(outputRows).toHaveLength(10);
    expect(outputRows.at(-1)).toContain('/ commands | @ mention | ? help');
  });
});
