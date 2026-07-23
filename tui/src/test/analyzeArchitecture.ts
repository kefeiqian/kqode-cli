import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { analyzeModulePolicy } from '@test/analyzeModulePolicy.ts';

const aliases: Readonly<Record<string, string>> = {
  '@/': '',
  '@backend/': 'backend/',
  '@components/': 'components/',
  '@constants/': 'constants/',
  '@contracts/': 'contracts/',
  '@hooks/': 'hooks/',
  '@libs/': 'libs/',
  '@state/': 'state/',
  '@test/': 'test/',
  '@theme/': 'theme/'
};

export function analyzeArchitecture(srcRoot: string) {
  const files = sourceFiles(srcRoot);
  const relativeFile = (file: string): string =>
    path.relative(srcRoot, file).split(path.sep).join('/');
  const graph = new Map(
    files.map((file) => [file, dependencies(file, srcRoot)])
  );
  const modulePolicy = analyzeModulePolicy(files, relativeFile);

  return {
    ...modulePolicy,
    cycles: findCycles(files, graph, relativeFile),
    edgeCount: [...graph.values()].reduce((count, dependencies) => count + dependencies.length, 0),
    fileCount: files.length,
    layerViolations: [...graph].flatMap(([file, imports]) =>
      isTestFile(file, relativeFile)
        ? []
        : imports
            .filter((dependency) => layer(file, relativeFile) < layer(dependency, relativeFile))
            .map((dependency) => `${relativeFile(file)} -> ${relativeFile(dependency)}`)
    )
  };
}

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(entryPath)
      : /\.tsx?$/.test(entry.name)
        ? [entryPath]
        : [];
  });
}

function dependencies(file: string, srcRoot: string): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const specs: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specs.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specs.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specs.flatMap((specifier) => {
    const resolved = resolveImport(specifier, file, srcRoot);
    return resolved === null ? [] : [resolved];
  });
}

function resolveImport(specifier: string, from: string, srcRoot: string): string | null {
  const alias = Object.entries(aliases).find(([prefix]) => specifier.startsWith(prefix));
  const base =
    alias === undefined
      ? specifier.startsWith('.')
        ? path.resolve(path.dirname(from), specifier)
        : null
      : path.join(srcRoot, alias[1], specifier.slice(alias[0].length));
  if (base === null) {
    return null;
  }
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx')
  ].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function layer(file: string, relativeFile: (file: string) => string): number {
  const top = relativeFile(file).split('/')[0];
  if (top === 'constants' || top === 'contracts' || top === 'theme') return 0;
  if (top === 'libs' || top === 'backend') return 1;
  if (top === 'state' || top === 'hooks') return 2;
  if (top === 'components') return 3;
  return 4;
}

function isTestFile(file: string, relativeFile: (file: string) => string): boolean {
  const relative = relativeFile(file);
  return relative.includes('/__tests__/') || relative.startsWith('test/');
}

function findCycles(
  files: string[],
  graph: Map<string, string[]>,
  relativeFile: (file: string) => string
): string[] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles = new Set<string>();
  const visit = (file: string, trail: string[]): void => {
    if (visiting.has(file)) {
      const start = trail.indexOf(file);
      cycles.add([...trail.slice(start), file].map(relativeFile).join(' -> '));
      return;
    }
    if (visited.has(file)) return;
    visiting.add(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency, [...trail, file]);
    visiting.delete(file);
    visited.add(file);
  };
  for (const file of files) visit(file, []);
  return [...cycles].sort();
}
