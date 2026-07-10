import { Text } from 'ink';
import { useAtomValue } from 'jotai';
import { activeThemeAtom } from '@state/global/index.ts';
import { themeBaselineAtom } from '@state/ui/theme/index.ts';
import type { ThemeDefinition } from '@theme/themeConfig.ts';

const HIGHLIGHT_MARKER = '›';
const PLAIN_MARKER = ' ';
const ACTIVE_MARKER = '●';
const INACTIVE_MARKER = ' ';

/**
 * Renders one catalog theme row. The highlight (`›`) glyph marks the focused
 * row while the active (`●`) glyph marks your real theme — the baseline you
 * opened with — so during a live preview the marker keeps pointing at your
 * theme even as the highlighted row recolors the popup. Row colors come from
 * the active theme so the whole picker previews the highlighted theme.
 */
export function ThemeRow({
  columns,
  theme,
  highlighted
}: {
  columns: number;
  theme: ThemeDefinition;
  highlighted: boolean;
}) {
  const activeTheme = useAtomValue(activeThemeAtom);
  const baselineTheme = useAtomValue(themeBaselineAtom);
  const isActive = theme.id === baselineTheme.id;
  const marker = highlighted ? HIGHLIGHT_MARKER : PLAIN_MARKER;
  const active = isActive ? ACTIVE_MARKER : INACTIVE_MARKER;
  const color = highlighted ? activeTheme.colors.accentBlue : activeTheme.colors.foreground;

  return (
    <Text color={color} wrap="truncate">
      {truncate(`${marker}  ${active} ${theme.label}`, columns)}
    </Text>
  );
}

function truncate(text: string, columns: number): string {
  return text.slice(0, Math.max(0, columns));
}
