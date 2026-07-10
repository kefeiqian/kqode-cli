import { Text } from 'ink';
import { useAtomValue } from 'jotai';
import { activeThemeAtom } from '@state/global/index.ts';
import type { ThemeDefinition } from '@theme/themeConfig.ts';

const SELECTED_MARKER = '●';
const PLAIN_MARKER = ' ';

/**
 * Renders one catalog theme row. The focused row is marked with `●` on the left
 * and drawn in the accent color; with live preview the focused row is also the
 * theme being applied, so a single selection marker is enough. Row colors come
 * from the active theme so the whole picker previews the highlighted theme.
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
  const marker = highlighted ? SELECTED_MARKER : PLAIN_MARKER;
  const color = highlighted ? activeTheme.colors.accentBlue : activeTheme.colors.foreground;

  return (
    <Text color={color} wrap="truncate">
      {truncate(`${marker} ${theme.label}`, columns)}
    </Text>
  );
}

function truncate(text: string, columns: number): string {
  return text.slice(0, Math.max(0, columns));
}
