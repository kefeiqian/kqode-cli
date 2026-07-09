import { Text } from 'ink';
import { useAtomValue } from 'jotai';
import { activeThemeAtom } from '@state/global/index.ts';
import type { ThemeDefinition } from '@theme/themeConfig.ts';

const HIGHLIGHT_MARKER = '›';
const PLAIN_MARKER = ' ';
const ACTIVE_MARKER = '●';
const INACTIVE_MARKER = ' ';

/**
 * Renders one catalog theme row. The highlight (`›`) and active (`●`) glyphs
 * keep the focused row and the applied theme legible without relying on color
 * alone. Row colors come from the active theme so the picker chrome stays
 * consistent (apply happens on Enter, not on highlight).
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
  const isActive = theme.id === activeTheme.id;
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
