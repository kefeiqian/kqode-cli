import { Text } from 'ink';
import { useAtomValue } from 'jotai';
import { SELECTION_CHEVRON, SELECTION_GUTTER } from '@constants/ui.ts';
import { clipToWidth, padEndToWidth } from '@libs/text/displayWidth.ts';
import { activeThemeAtom } from '@state/global/index.ts';
import { safeChromeColumnsAtom } from '@state/ui/index.ts';

/**
 * One selectable list row shared by every command surface (`/theme`, `/model`,
 * `/connect`, `/memory`, resume, and the floating `/` command list). The
 * highlighted row gets a `❯` chevron gutter, the accent foreground, and a
 * full-width `inputBackground` bar — the row is padded to the safe chrome width
 * (display-aware) so the background reads as a solid selection bar rather than a
 * ragged patch behind the text. Non-highlighted rows get a blank two-column
 * gutter so text stays column-aligned with the highlighted row.
 *
 * `content` is the already-composed row text. Columnar callers pre-fit it to
 * `safeChromeColumns - SELECTION_GUTTER_WIDTH` and pass it here; free-text callers
 * pass raw text and let the shared safe width clip it. `color` sets the
 * non-highlighted foreground (defaults to the theme foreground); the highlighted
 * row always uses the accent color, and any semantic glyph embedded in `content`
 * (e.g. `/model`'s active `●`) adopts that accent under the bar.
 */
export function SelectableRow({
  highlighted,
  content,
  color
}: {
  highlighted: boolean;
  content: string;
  color?: string;
}) {
  const columns = useAtomValue(safeChromeColumnsAtom);
  const theme = useAtomValue(activeThemeAtom);

  const gutter = highlighted ? SELECTION_CHEVRON : SELECTION_GUTTER;
  const clipped = clipToWidth(`${gutter}${content}`, columns);
  const line = highlighted ? padEndToWidth(clipped, columns) : clipped;

  return (
    <Text
      color={highlighted ? theme.colors.accentBlue : (color ?? theme.colors.foreground)}
      backgroundColor={highlighted ? theme.colors.inputBackground : undefined}
    >
      {line}
    </Text>
  );
}
