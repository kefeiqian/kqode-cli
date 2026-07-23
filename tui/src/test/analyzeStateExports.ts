import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export function stateExportViolations(
  file: string,
  relativeFile: (file: string) => string
): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const atomFactories = jotaiAtomFactories(source);
  return source.statements.flatMap((statement) => {
    if (ts.isExportDeclaration(statement)) {
      if (
        statement.moduleSpecifier !== undefined &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        !isStateModule(statement.moduleSpecifier.text, file, relativeFile)
      ) {
        return [`${relativeFile(file)}:*`];
      }
      if (statement.exportClause === undefined || statement.isTypeOnly) return [];
      if (!ts.isNamedExports(statement.exportClause)) {
        return [`${relativeFile(file)}:*`];
      }
      return statement.exportClause.elements
        .filter((element) => !element.isTypeOnly && !element.name.text.endsWith('Atom'))
        .map((element) => `${relativeFile(file)}:${element.name.text}`);
    }
    if (!isExported(statement)) return [];
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      return [];
    }
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.flatMap((declaration) => {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text.endsWith('Atom') &&
          declaration.initializer !== undefined &&
          isAtomInitializer(declaration.initializer, atomFactories)
        ) {
          return [];
        }
        return ts.isIdentifier(declaration.name)
          ? [`${relativeFile(file)}:${declaration.name.text}`]
          : [`${relativeFile(file)}:<binding>`];
      });
    }
    const name =
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name !== undefined
        ? statement.name.text
        : '<anonymous>';
    return [`${relativeFile(file)}:${name}`];
  });
}

function isExported(statement: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement)?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    ) ?? false)
  );
}

type AtomFactories = {
  names: Set<string>;
  namespaces: Set<string>;
};

function jotaiAtomFactories(source: ts.SourceFile): AtomFactories {
  const names = new Set<string>();
  const namespaces = new Set<string>();
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'jotai'
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
      continue;
    }
    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === 'atom') {
        names.add(element.name.text);
      }
    }
  }
  return { names, namespaces };
}

function isAtomInitializer(initializer: ts.Expression, factories: AtomFactories): boolean {
  const expression =
    ts.isAsExpression(initializer) ||
    ts.isSatisfiesExpression(initializer) ||
    ts.isParenthesizedExpression(initializer) ||
    ts.isTypeAssertionExpression(initializer) ||
    ts.isNonNullExpression(initializer)
      ? initializer.expression
      : initializer;
  if (expression !== initializer) {
    return isAtomInitializer(expression, factories);
  }
  if (!ts.isCallExpression(expression)) return false;
  if (ts.isIdentifier(expression.expression)) {
    return factories.names.has(expression.expression.text);
  }
  return (
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'atom' &&
    ts.isIdentifier(expression.expression.expression) &&
    factories.namespaces.has(expression.expression.expression.text)
  );
}

function isStateModule(
  specifier: string,
  file: string,
  relativeFile: (file: string) => string
): boolean {
  if (specifier.startsWith('@state/')) return true;
  if (!specifier.startsWith('.')) return false;
  return relativeFile(path.resolve(path.dirname(file), specifier)).startsWith('state/');
}
