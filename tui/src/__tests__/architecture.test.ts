import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeArchitecture } from '@test/analyzeArchitecture.ts';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const componentExportBaseline: string[] = [];

const layerViolationBaseline: string[] = [];

const unknownLayerBaseline: string[] = [];

const stateExportBaseline = [
  'state/global/model.ts:DEFAULT_MODEL_LABEL',
  'state/ui/dimensions.ts:FULLSCREEN_GUARD_ROWS',
  'state/ui/dimensions.ts:MIN_USABLE_TERMINAL_COLUMNS',
  'state/ui/dimensions.ts:MIN_USABLE_TERMINAL_ROWS',
  'state/ui/statusHint.ts:BACKEND_LOADING_HINT'
];

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

  it('exports only atoms and types from state modules', () => {
    expect(report.stateExportViolations).toEqual(stateExportBaseline);
  });
});
