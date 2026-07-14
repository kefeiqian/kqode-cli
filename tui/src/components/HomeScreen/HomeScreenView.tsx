import { Box } from 'ink';
import { useAtomValue } from 'jotai';
import { BodyPane } from '@components/BodyPane.tsx';
import { CwdLine } from '@components/CwdLine.tsx';
import { Header } from '@components/Header.tsx';
import { PromptComposer } from '@components/PromptComposer/index.tsx';
import { ResumePanel } from '@components/ResumePanel/index.tsx';
import { ThemeSurface } from '@components/ThemeSurface/index.tsx';
import { ModelSurface } from '@components/ModelSurface/index.tsx';
import { MemorySurface } from '@components/MemorySurface/index.tsx';
import { ConnectSurface } from '@components/ConnectSurface/index.tsx';
import { UserQuestionSurface } from '@components/UserQuestionSurface/index.tsx';
import { SlashCommandMenu } from '@components/SlashCommandMenu/index.tsx';
import { StatusBar } from '@components/StatusBar.tsx';
import { useHomeScreenInput } from '@components/HomeScreen/useHomeScreenInput.ts';
import { BODY_CWD_GAP_ROWS } from '@libs/tui/layout.ts';
import { bottomSpacerRowsAtom, homeHeaderRowsAtom, layoutAtom } from '@state/ui/index.ts';
import { columnsAtom, rowsAtom } from '@state/ui/index.ts';
import { commandMenuOpenAtom } from '@state/ui/commands/index.ts';
import { activeDockedPanelAtom, DockedPanel } from '@state/ui/dock/atoms.ts';
import { activeThemeAtom } from '@state/global/index.ts';

export function HomeScreenView() {
  const columns = useAtomValue(columnsAtom);
  const rows = useAtomValue(rowsAtom);
  const theme = useAtomValue(activeThemeAtom);
  useHomeScreenInput();

  return (
    <Box
      flexDirection="column"
      width={columns}
      height={rows}
      backgroundColor={theme.colors.bodyBackground}
    >
      <HomeHeader />
      <HomeBody />
      <HomeBottomStack />
      <HomeComposer />
      <HomeStatusBar />
    </Box>
  );
}

function HomeHeader() {
  const headerRows = useAtomValue(homeHeaderRowsAtom);
  if (headerRows === 0) {
    return null;
  }

  return <Header />;
}

function HomeBody() {
  const layout = useAtomValue(layoutAtom);
  const theme = useAtomValue(activeThemeAtom);

  return (
    <Box
      height={layout.bodyRows}
      flexDirection="column"
      backgroundColor={theme.colors.bodyBackground}
    >
      <BodyPane rows={layout.bodyRows} />
    </Box>
  );
}

function HomeBottomStack() {
  const bottomSpacerRows = useAtomValue(bottomSpacerRowsAtom);
  const menuOpen = useAtomValue(commandMenuOpenAtom);
  const dockedPanel = useAtomValue(activeDockedPanelAtom);

  if (dockedPanel !== null) {
    return (
      <Box marginTop={bottomSpacerRows} flexDirection="column">
        <DockedSurface panel={dockedPanel} />
      </Box>
    );
  }

  // The cwd line and the command palette share the row directly above the
  // composer: the palette replaces the cwd while it is open. The spacer + gap
  // margin sits on this wrapper so the cwd/menu block, composer, and status row
  // stay pinned to the bottom whether or not the cwd is shown.
  return (
    <Box marginTop={bottomSpacerRows + BODY_CWD_GAP_ROWS} flexDirection="column">
      {menuOpen ? null : <CwdLine />}
      <SlashCommandMenu />
    </Box>
  );
}

/** Renders the one open docked popup below the accent divider it owns. */
function DockedSurface({ panel }: { panel: DockedPanel }) {
  switch (panel) {
    case DockedPanel.Resume:
      return <ResumePanel />;
    case DockedPanel.Theme:
      return <ThemeSurface />;
    case DockedPanel.Model:
      return <ModelSurface />;
    case DockedPanel.Memory:
      return <MemorySurface />;
    case DockedPanel.Connect:
      return <ConnectSurface />;
    case DockedPanel.UserQuestion:
      return <UserQuestionSurface />;
    default:
      return null;
  }
}

function HomeComposer() {
  const docked = useAtomValue(activeDockedPanelAtom) !== null;
  if (docked) {
    return null;
  }

  return <PromptComposer />;
}

function HomeStatusBar() {
  const docked = useAtomValue(activeDockedPanelAtom) !== null;
  if (docked) {
    return null;
  }

  return <StatusBar />;
}
