import { describe, expect, it } from 'vitest';
import { formatDuration } from '@libs/exitSummary/formatDuration.ts';

describe('formatDuration', () => {
  it('renders seconds only under a minute', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(5_000)).toBe('5s');
  });

  it('renders minutes and seconds under an hour', () => {
    expect(formatDuration(65_000)).toBe('1m 5s');
  });

  it('renders hours, minutes, and seconds', () => {
    expect(formatDuration(3_725_000)).toBe('1h 2m 5s');
  });

  it('floors sub-second and negative input to 0s', () => {
    expect(formatDuration(900)).toBe('0s');
    expect(formatDuration(-1_000)).toBe('0s');
  });
});
