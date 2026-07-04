import { describe, expect, it } from 'vitest';
import { resolveHomeScreenLayout } from '@libs/tui/layout.ts';

describe('resolveHomeScreenLayout with a command menu', () => {
  it('reflows the body by the menu height when the transcript fills the pane', () => {
    const withoutMenu = resolveHomeScreenLayout(24, 1000, 3, 1, 0);
    const withMenu = resolveHomeScreenLayout(24, 1000, 3, 1, 3);

    expect(withMenu.bodyRows).toBe(withoutMenu.bodyRows - 3);
    expect(withMenu.bodyRows).toBeGreaterThanOrEqual(1);
  });

  it('never drops the body below one row', () => {
    const layout = resolveHomeScreenLayout(12, 1000, 3, 1, 8);
    expect(layout.bodyRows).toBeGreaterThanOrEqual(1);
  });
});
