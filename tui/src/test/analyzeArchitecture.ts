import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { analyzeModulePolicy } from '@test/analyzeModulePolicy.ts';

export function analyzeArchitecture(srcRoot: string) {
  const packageRoot = path.dirname(srcRoot);
  const compilerOptions = loadCompilerOptions(packageRoot);
  const files = sourceFiles(srcRoot);
  const relativeFile = (file: string): string =>
    path.relative(srcRoot, file).split(path.sep).join('/');
  const graph = new Map(
    files.map((file) => [file, dependencies(file, compilerOptions)])
  );
  const modulePolicy = analyzeModulePolicy(files, relativeFile);
  const unknownLayerFiles = files
    .filter((file) => !isTestFile(file, relativeFile) && layer(file, relativeFile) === null)
    .map(relativeFile)
    .sort();

  return {
    ...modulePolicy,
    cycles: findCycles(files, graph, relativeFile),
    edgeCount: [...graph.values()].reduce((count, dependencies) => count + dependencies.length, 0),
    entryPointViolations: dependencies(path.join(packageRoot, 'main.tsx'), compilerOptions)
      .filter((dependency) => layer(dependency, relativeFile) !== 4)
      .map((dependency) => `main.tsx -> ${relativeFile(dependency)}`),
    fileCount: files.length,
    layerViolations: [...graph].flatMap(([file, imports]) =>
      isTestFile(file, relativeFile)
        ? []
        : imports
            .filter((dependency) => {
              const sourceLayer = layer(file, relativeFile);
              const dependencyLayer = layer(dependency, relativeFile);
              return (
                sourceLayer !== null &&
                dependencyLayer !== null &&
                sourceLayer < dependencyLayer
              );
            })
            .map((dependency) => `${relativeFile(file)} -> ${relativeFile(dependency)}`)
    ),
    unknownLayerFiles
  };
}

function loadCompilerOptions(packageRoot: string): ts.CompilerOptions {
  const configPath = path.join(packageRoot, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  }
  return ts.parseJsonConfigFileContent(config.config, ts.sys, packageRoot).options;
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

function dependencies(file: string, compilerOptions: ts.CompilerOptions): string[] {
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
    const resolved = ts.resolveModuleName(
      specifier,
      file,
      compilerOptions,
      ts.sys
    ).resolvedModule;
    return resolved === undefined || resolved.isExternalLibraryImport
      ? []
      : [resolved.resolvedFileName];
  });
}

function layer(file: string, relativeFile: (file: string) => string): number | null {
  const relative = relativeFile(file);
  const top = relative.split('/')[0];
  if (top === 'constants' || top === 'contracts' || top === 'theme') return 0;
  if (top === 'libs' || top === 'backend') return 1;
  if (top === 'state' || top === 'hooks') return 2;
  if (top === 'components') return 3;
  if (top === 'cli' || ['App.tsx', 'bootstrap.ts', 'devGlobals.ts', 'globals.d.ts'].includes(relative)) {
    return 4;
  }
  return null;
}

function isTestFile(file: string, relativeFile: (file: string) => string): boolean {
  const relative = relativeFile(file);
  return (
    relative.startsWith('__tests__/') ||
    relative.includes('/__tests__/') ||
    relative.startsWith('test/')
  );
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
