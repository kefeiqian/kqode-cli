import { bannerLines } from '@components/AppExitSummary/banner.ts';
import { boxed } from '@components/AppExitSummary/border.ts';
import { formatDuration } from '@components/AppExitSummary/formatDuration.ts';
import type { Colorize, ExitSummaryData } from '@components/AppExitSummary/types.ts';
import { PRODUCT_NAME } from '@constants/product.ts';
import { visibleLength } from '@libs/terminal/ansiColor.ts';
import { maxWidth } from '@libs/text/maxWidth.ts';
import type { ThemeDefinition } from '@theme/themeConfig.ts';

const INSERTIONS_SIGN = '+';
const DELETIONS_SIGN = '−';
const COLUMN_GAP = '  ';
const ROW_LABELS = ['Changes', 'Duration', 'Cost', 'Tokens', 'Resume'] as const;
const LABEL_WIDTH = Math.max(...ROW_LABELS.map((label) => label.length));

type RowLabel = (typeof ROW_LABELS)[number];

export type FormatExitSummaryCardOptions = {
  colorize: Colorize;
  columns: number;
  theme: ThemeDefinition;
};

/**
 * Renders the exit summary card as a plain multi-line string: the KQode wordmark
 * banner on top and the labeled stat rows below, wrapped in a rounded border.
 *
 * Rows whose data is empty are omitted entirely rather than shown as a
 * placeholder, so the card only lists stats that carry a real value. The card
 * degrades to fit `columns`: the full block banner, then a single-line wordmark,
 * then borderless stacked rows on very narrow terminals. Only the `+`/`−`
 * Changes counts are colorized so the card stays legible on the user's restored
 * (possibly light) terminal background. `colorize` is injected — pass an
 * identity function to assert plain structure.
 */
export function formatExitSummaryCard(
  data: ExitSummaryData,
  { colorize, columns, theme }: FormatExitSummaryCardOptions
): string {
  const rows = ROW_LABELS.map((label) => renderRow(label, data, colorize, theme)).filter(
    (row): row is string => row !== undefined
  );
  return renderCard(rows, columns).join('\n');
}

function renderCard(rows: readonly string[], columns: number): string[] {
  // Keep the banner/rows separator only when there is at least one row to show.
  const content = rows.length > 0 ? ['', ...rows] : [];
  for (const header of [bannerLines(), [PRODUCT_NAME]]) {
    const card = boxed([...header, ...content], { width: visibleLength });
    if (maxWidth(card, visibleLength) <= columns) {
      return card;
    }
  }

  // Too narrow for a bordered card — stack the rows plainly.
  return [...rows];
}

function renderRow(
  label: RowLabel,
  data: ExitSummaryData,
  colorize: Colorize,
  theme: ThemeDefinition
): string | undefined {
  const value = renderValue(label, data, colorize, theme);
  if (value === undefined) {
    return undefined;
  }
  return `${label.padEnd(LABEL_WIDTH)}${COLUMN_GAP}${value}`;
}

/** Returns the rendered value, or `undefined` when the row has no data to show. */
function renderValue(
  label: RowLabel,
  data: ExitSummaryData,
  colorize: Colorize,
  theme: ThemeDefinition
): string | undefined {
  if (label === 'Changes') {
    if (data.changes === undefined) {
      return undefined;
    }
    const added = colorize(`${INSERTIONS_SIGN}${data.changes.insertions}`, theme.colors.accentGreen);
    const removed = colorize(`${DELETIONS_SIGN}${data.changes.deletions}`, theme.colors.errorRed);
    return `${added} ${removed}`;
  }

  if (label === 'Duration') {
    return data.durationMs === undefined ? undefined : formatDuration(data.durationMs);
  }

  if (label === 'Resume') {
    return data.resumeCommand;
  }

  // Cost and Tokens have no data source yet — omitted until they do.
  return undefined;
}
