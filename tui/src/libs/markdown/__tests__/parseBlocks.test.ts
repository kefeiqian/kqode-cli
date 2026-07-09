import { describe, expect, it } from 'vitest';
import { parseBlocks } from '@libs/markdown/parseBlocks.ts';

describe('parseBlocks', () => {
  it('classifies block markdown tokens including code and tables', () => {
    const tokens = parseBlocks('# Title\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```ts\nx\n```');

    expect(tokens.map((token) => token.type)).toEqual(['heading', 'space', 'table', 'space', 'code']);
  });
});
