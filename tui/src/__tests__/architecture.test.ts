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
  'components/AppExitSummary/types.ts:ExitSummaryData'
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
