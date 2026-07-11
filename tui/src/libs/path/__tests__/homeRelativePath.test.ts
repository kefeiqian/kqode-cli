import { describe, expect, it } from 'vitest';
import { displayWidth } from '@libs/text/displayWidth.ts';
import { homeRelativePath, toHomeRelativeDisplay } from '@libs/path/homeRelativePath.ts';

describe('homeRelativePath', () => {
  it('exposes the untruncated home-relative display form for sizing', () => {
    expect(
      toHomeRelativeDisplay('C:\\Users\\kefeiqian\\Projects\\KQode\\deep\\leaf', 'C:\\Users\\kefeiqian')
    ).toBe('~\\Projects\\KQode\\deep\\leaf');
  });

  it('renders a path under home with a tilde and preserved tail segment', () => {
    const result = homeRelativePath(
      'C:\\Users\\kefeiqian\\Projects\\KQode\\blog-v0.1',
      'C:\\Users\\kefeiqian',
      18
    );

    expect(result).toBe('~\\...\\blog-v0.1');
    expect(displayWidth(result)).toBeLessThanOrEqual(18);
  });

  it('leaves paths outside home absolute while truncating their middle', () => {
    const result = homeRelativePath('D:\\Work\\clients\\demo-app', 'C:\\Users\\kefeiqian', 18);

    expect(result).toBe('D:\\...\\demo-app');
    expect(result.startsWith('~')).toBe(false);
  });

  it('renders the home directory itself as tilde', () => {
    expect(homeRelativePath('C:\\Users\\kefeiqian', 'C:\\Users\\kefeiqian', 10)).toBe('~');
  });

  it('truncates a single wide tail segment when it cannot fit', () => {
    const result = homeRelativePath(
      'C:\\Users\\kefeiqian\\Projects\\very-long-tail-folder',
      'C:\\Users\\kefeiqian',
      16
    );

    expect(result).toBe('~\\...\\very-long…');
    expect(displayWidth(result)).toBeLessThanOrEqual(16);
  });

  it('keeps a POSIX absolute path outside home absolute when middle-truncating', () => {
    const result = homeRelativePath('/opt/projects/services/my-web-app', '/home/user', 20);

    expect(result).toBe('/opt/.../my-web-app');
    expect(result.startsWith('/')).toBe(true);
    expect(displayWidth(result)).toBeLessThanOrEqual(20);
  });

  it('matches mixed path separators and renders with the platform separator from home', () => {
    const result = homeRelativePath('C:/Users/kefeiqian/Projects/KQode', 'C:\\Users\\kefeiqian', 12);

    expect(result).toBe('~\\...\\KQode');
  });
});
