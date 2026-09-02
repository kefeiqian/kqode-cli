import { SelectableRow } from '@components/SelectableRow/index.tsx';
import type { ThemeDefinition } from '@theme/themeConfig.ts';

/**
 * Renders one catalog theme row through the shared `SelectableRow`: the focused
 * row gets the chevron + accent bar. With live preview the focused row is also
 * the theme being applied, so `SelectableRow` reading the active theme previews
 * the highlighted theme's accent.
 */
export function ThemeRow({ theme, highlighted }: { theme: ThemeDefinition; highlighted: boolean }) {
  return <SelectableRow highlighted={highlighted} content={theme.label} />;
}
