import {
  LOWER_HALF_BLOCK,
  UPPER_HALF_BLOCK
} from '@libs/tui/backgroundBlock.ts';

export type SurfaceBorderEdge = 'top' | 'bottom';

const APPLE_TERMINAL_PROGRAM = 'Apple_Terminal';
const HORIZONTAL_LINE = '─';

/** Terminal-specific composer border glyph without changing its row budget. */
export function resolveSurfaceBorderGlyph(
  edge: SurfaceBorderEdge,
  termProgram = process.env.TERM_PROGRAM
): string {
  if (termProgram === APPLE_TERMINAL_PROGRAM) {
    return HORIZONTAL_LINE;
  }
  return edge === 'top' ? LOWER_HALF_BLOCK : UPPER_HALF_BLOCK;
}

/** Terminal.app user messages use only their filled text rows, without borders. */
export function resolveMessageBorderGlyph(
  edge: SurfaceBorderEdge,
  termProgram = process.env.TERM_PROGRAM
): string | null {
  return termProgram === APPLE_TERMINAL_PROGRAM
    ? null
    : resolveSurfaceBorderGlyph(edge, termProgram);
}

/** Terminal.app uses line borders without a distinct filled composer surface. */
export function resolveComposerBackgroundEnabled(
  termProgram = process.env.TERM_PROGRAM
): boolean {
  return termProgram !== APPLE_TERMINAL_PROGRAM;
}

/** Terminal.app may extend decorative lines through the final-cell gutter. */
export function resolveComposerBorderColumns(
  composerColumns: number,
  terminalColumns: number,
  termProgram = process.env.TERM_PROGRAM
): number {
  return termProgram === APPLE_TERMINAL_PROGRAM
    ? Math.max(1, terminalColumns)
    : Math.max(1, composerColumns);
}
