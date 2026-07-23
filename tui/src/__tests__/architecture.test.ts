import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeArchitecture } from '@test/analyzeArchitecture.ts';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const componentExportBaseline = [
  'components/AppExitSummary/banner.ts:bannerLines',
  'components/AppExitSummary/border.ts:BoxOptions',
  'components/AppExitSummary/border.ts:boxed',
  'components/AppExitSummary/computeExitSummary.ts:ComputeExitSummaryDeps',
  'components/AppExitSummary/computeExitSummary.ts:computeExitSummary',
  'components/AppExitSummary/finishSession.ts:FinishSessionDeps',
  'components/AppExitSummary/finishSession.ts:finishSession',
  'components/AppExitSummary/formatDuration.ts:formatDuration',
  'components/AppExitSummary/formatExitSummaryCard.ts:FormatExitSummaryCardOptions',
  'components/AppExitSummary/formatExitSummaryCard.ts:formatExitSummaryCard',
  'components/AppExitSummary/printExitSummary.ts:PrintExitSummaryDeps',
  'components/AppExitSummary/printExitSummary.ts:printExitSummary',
  'components/AppExitSummary/resolveSessionSeed.ts:ResolveSessionSeedDeps',
  'components/AppExitSummary/resolveSessionSeed.ts:SessionSeed',
  'components/AppExitSummary/resolveSessionSeed.ts:resolveSessionSeed',
  'components/AppExitSummary/types.ts:Colorize',
  'components/AppExitSummary/types.ts:ExitSummaryData',
  'components/HelpScreen/helpContent.ts:HelpEntry',
  'components/HelpScreen/helpContent.ts:HelpLine',
  'components/HelpScreen/helpContent.ts:HelpSection',
  'components/HelpScreen/helpContent.ts:buildCommandSection',
  'components/HelpScreen/helpContent.ts:buildHelpSections',
  'components/HelpScreen/helpContent.ts:flattenHelpLines',
  'components/HomeScreen/useComposerCaretRefresh.ts:useComposerCaretRefresh',
  'components/HomeScreen/usePullRequestClick.ts:usePullRequestClick',
  'components/HomeScreen/wheelRouting.ts:WheelTarget',
  'components/HomeScreen/wheelRouting.ts:isPointerOverComposer',
  'components/HomeScreen/wheelRouting.ts:resolveWheelTarget',
  'components/HomeScreen/wheelScroll.ts:handleWheelScroll',
  'components/PromptComposer/cursorPosition.ts:resolveComposerCursorPosition',
  'components/PromptComposer/input/handleCursorMove.ts:handleCursorMove',
  'components/PromptComposer/input/handleEscArmedClear.ts:handleEscArmedClear',
  'components/PromptComposer/input/handleNewline.ts:handleNewline',
  'components/PromptComposer/input/handleSubmit.ts:handleSubmit',
  'components/PromptComposer/input/handleTextEdit.ts:handleTextEdit',
  'components/PromptComposer/input/types.ts:ComposerInputState',
  'components/PromptComposer/input/types.ts:ComposerKeyContext',
  'components/PromptComposer/input/types.ts:ComposerKeyHandler',
  'components/PromptComposer/promptTextView.ts:countVisibleComposerRows',
  'components/PromptComposer/promptTextView.ts:formatValidationError',
  'components/PromptComposer/usePromptComposerInput.ts:usePromptComposerInput',
  'components/SlashCommandMenu/handleMenuKey.ts:handleMenuKey'
];

const layerViolationBaseline = [
  'backend/runtime/backendRuntime.ts -> state/global/backend.ts',
  'backend/runtime/backendRuntime.ts -> state/ui/gitStatus.ts',
  'backend/runtime/backendRuntime.ts -> state/ui/statusHint.ts'
];

const unknownLayerBaseline = ['useGlobalKeys.ts'];

describe('TUI architecture boundaries', () => {
  const report = analyzeArchitecture(srcRoot);

  it('keeps dependencies flowing toward lower layers', () => {
    expect(report.fileCount).toBeGreaterThan(0);
    expect(report.edgeCount).toBeGreaterThan(0);
    expect(report.layerViolations.sort()).toEqual(layerViolationBaseline);
  });

  it('has no circular module dependencies', () => {
    expect(report.cycles).toEqual([]);
  });

  it('keeps entrypoints at the composition layer and rejects unknown layers', () => {
    expect(report.entryPointViolations).toEqual([]);
    expect(report.unknownLayerFiles).toEqual(unknownLayerBaseline);
  });

  it('exports only React components from component modules', () => {
    expect(report.componentExportViolations).toEqual(componentExportBaseline);
  });

  it('keeps constants dependency-free and statically initialized', () => {
    expect(report.constantViolations).toEqual([]);
  });
});
