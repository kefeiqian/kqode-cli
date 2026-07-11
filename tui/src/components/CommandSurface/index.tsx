import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import type { ReactNode } from 'react';
import { CommandFooter, type FooterTone } from '@components/CommandSurface/CommandFooter.tsx';
import type { CommandSurfaceLayout } from '@components/CommandSurface/useCommandSurfaceLayout.ts';
import { DockDivider } from '@components/DockDivider.tsx';
import { activeThemeAtom } from '@state/global/index.ts';

/**
 * The shared frame for every bottom-docked command surface (`/theme`, `/model`,
 * `/memory`, `/connect`, resume). It renders the uniform chrome — accent top rule
 * (`DockDivider`), the accent `/label`, an optional `header`, a fixed-height body
 * region, the always-on gap row, and the bottom-pinned `CommandFooter` — so
 * surfaces differ only in their inner content.
 *
 * The footer is pinned purely by the fixed body height: children stack in
 * document order with no `justifyContent` or bottom spacer, so with a correct
 * `chromeWithGap` (fed to `useCommandSurfaceLayout`) the surface fills `panelRows`
 * exactly. `bodyRows` is the surface's content-row budget — usually
 * `layout.bodyRows`, but resume caps it at its session-row limit; `layout` carries
 * the shared `columns` and the `showFooterGap` decision.
 */
export function CommandSurface({
  panelRows,
  layout,
  label,
  header,
  bodyRows,
  footerHint,
  footerTone,
  position,
  children
}: {
  panelRows: number;
  layout: CommandSurfaceLayout;
  label: string;
  header?: ReactNode;
  bodyRows: number;
  footerHint: string;
  footerTone?: FooterTone;
  position: string;
  children: ReactNode;
}) {
  const theme = useAtomValue(activeThemeAtom);

  return (
    <Box flexDirection="column" height={panelRows} overflow="hidden">
      <DockDivider />
      <Text color={theme.colors.accentBlue}>{label}</Text>
      {header ?? null}
      <Box flexDirection="column" height={bodyRows} overflow="hidden">
        {children}
      </Box>
      {layout.showFooterGap ? <Text> </Text> : null}
      <CommandFooter columns={layout.columns} hint={footerHint} position={position} tone={footerTone} />
    </Box>
  );
}
