import { describe, expect, it } from 'vitest';
import { WEZTERM_FULLSCREEN_GUARD_ROWS } from '@constants/terminal.ts';
import { resolveFullscreenGuardRows } from '@libs/terminal/fullscreenGuard.ts';

describe('resolveFullscreenGuardRows', () => {
  it('reserves one row for WezTerm', () => {
    expect(resolveFullscreenGuardRows('WezTerm')).toBe(
      WEZTERM_FULLSCREEN_GUARD_ROWS
    );
  });

  it('does not reduce the canvas in other terminals', () => {
    expect(resolveFullscreenGuardRows('Windows_Terminal')).toBe(0);
    expect(resolveFullscreenGuardRows('')).toBe(0);
  });
});
