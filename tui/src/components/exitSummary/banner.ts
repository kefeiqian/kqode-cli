import { PRODUCT_NAME } from '@constants/product.ts';

const BANNER_HEIGHT = 5;
const CELL_WIDTH = 5;

// Directional 5-row block letters for the KQode wordmark banner. The exact
// glyphs are swappable; the contract is a fixed-height, uniform-width banner the
// card can center and the border can wrap.
const FONT: Record<string, readonly string[]> = {
  K: ['█  █', '█ █ ', '██  ', '█ █ ', '█  █'],
  Q: ['████', '█  █', '█  █', '█ ██', '████▖'],
  O: ['████', '█  █', '█  █', '█  █', '████'],
  D: ['███ ', '█  █', '█  █', '█  █', '███ '],
  E: ['████', '█   ', '███ ', '█   ', '████']
};

/**
 * Renders `word` as a fixed-height block-letter banner: one string per row, each
 * row padded to the same width so a border wraps cleanly. Unknown characters are
 * skipped. Defaults to the product name.
 */
export function bannerLines(word: string = PRODUCT_NAME): string[] {
  const glyphs = [...word.toUpperCase()]
    .map((char) => FONT[char])
    .filter((glyph): glyph is readonly string[] => glyph !== undefined);

  const rows: string[] = [];
  for (let row = 0; row < BANNER_HEIGHT; row += 1) {
    rows.push(glyphs.map((glyph) => (glyph[row] ?? '').padEnd(CELL_WIDTH)).join(' '));
  }

  return rows;
}
