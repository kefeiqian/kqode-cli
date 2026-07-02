import { describe, expect, it } from 'vitest';
import { bannerLines } from '@components/exitSummary/banner.ts';

describe('bannerLines', () => {
  it('renders a fixed 5-row block banner for the KQode wordmark', () => {
    const lines = bannerLines();

    expect(lines).toHaveLength(5);
    expect(lines.join('\n')).toContain('█');
  });

  it('pads every row to the same width so a border wraps cleanly', () => {
    const lines = bannerLines();
    const widths = new Set(lines.map((line) => line.length));

    expect(widths.size).toBe(1);
  });

  it('skips unknown characters rather than throwing', () => {
    expect(() => bannerLines('KQ!')).not.toThrow();
    expect(bannerLines('KQ!')).toHaveLength(5);
  });
});
