import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeArchitecture } from '@test/analyzeArchitecture.ts';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('analyzeArchitecture', () => {
  it('resolves NodeNext .js specifiers and rejects unknown source layers', () => {
    const root = fixtureRoot();
    write(root, 'main.tsx', "import { View } from '@components/View.js';\nvoid View;\n");
    write(root, 'src/components/View.tsx', 'export function View() { return <div />; }\n');
    write(root, 'src/state/bad.ts', "import { View } from '@components/View.js';\nvoid View;\n");
    write(root, 'src/utils/helper.ts', 'export const value = 1;\n');

    const report = analyzeArchitecture(path.join(root, 'src'));

    expect(report.entryPointViolations).toEqual(['main.tsx -> components/View.tsx']);
    expect(report.layerViolations).toEqual(['state/bad.ts -> components/View.tsx']);
    expect(report.unknownLayerFiles).toEqual(['utils/helper.ts']);
  });

  it('distinguishes React components from helpers and mutable constants', () => {
    const root = fixtureRoot();
    write(root, 'main.tsx', '');
    write(root, 'src/components/View.tsx', [
      'export function View() { return <div />; }',
      'export function EmptyView() { return null; }',
      'export function ParseConfig() { return 1; }',
      'export function NestedHelper() { const render = () => <div />; return 1; }',
      'export function MaybeHelper() { if (true) return null; return { ok: true }; }',
      'export class FakeView { render() { return <div />; } }'
    ].join('\n'));
    write(root, 'src/constants/input.ts', [
      "export const SAFE: readonly string[] = ['enter'];",
      "export const CONST_ASSERTED = ['tab'] as const;",
      "export const MUTABLE = ['escape'];",
      "export const PARENTHESIZED = (['space']);",
      "export const SHALLOW: Readonly<{ values: string[] }> = { values: [] };",
      "export const CONDITIONAL = true ? ['a'] : ['b'];",
      "export const NAMED: readonly [item: { value: string }] = [{ value: 'x' }];",
      'declare const value: { key?: string };',
      'delete value.key;'
    ].join('\n'));
    write(root, 'src/state/example.ts', [
      "import { atom as jotaiAtom } from 'jotai';",
      'export type State = { value: number };',
      'export const valueAtom = (jotaiAtom(0) as unknown);',
      'export const DEFAULT_VALUE = 0;',
      'export function calculate() { return 1; }'
    ].join('\n'));
    write(root, 'src/state/fake.ts', [
      'const atom = (value: number) => value;',
      'export const fakeAtom = atom(0);'
    ].join('\n'));
    write(root, 'src/state/index.ts', "export * from '@libs/helper.ts';\n");
    write(root, 'src/libs/helper.ts', 'export const helper = 1;\n');

    const report = analyzeArchitecture(path.join(root, 'src'));

    expect(report.componentExportViolations).toEqual([
      'components/View.tsx:FakeView',
      'components/View.tsx:MaybeHelper',
      'components/View.tsx:NestedHelper',
      'components/View.tsx:ParseConfig'
    ]);
    expect(report.constantViolations).toEqual(expect.arrayContaining([
      'constants/input.ts:DeleteExpression',
      'constants/input.ts:ConditionalExpression',
      'constants/input.ts:NAMED:mutable',
      'constants/input.ts:MUTABLE:mutable',
      'constants/input.ts:PARENTHESIZED:mutable',
      'constants/input.ts:SHALLOW:mutable'
    ]));
    expect(report.stateExportViolations).toEqual([
      'state/example.ts:DEFAULT_VALUE',
      'state/example.ts:calculate',
      'state/fake.ts:fakeAtom',
      'state/index.ts:*'
    ]);
  });
});

function fixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kqode-architecture-'));
  tempRoots.push(root);
  write(root, 'tsconfig.json', JSON.stringify({
    compilerOptions: {
      allowImportingTsExtensions: true,
      jsx: 'react-jsx',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      paths: {
        '@/*': ['./src/*'],
        '@components/*': ['./src/components/*'],
        '@libs/*': ['./src/libs/*']
      }
    },
    include: ['main.tsx', 'src/**/*.ts', 'src/**/*.tsx']
  }));
  return root;
}

function write(root: string, relativePath: string, content: string): void {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
