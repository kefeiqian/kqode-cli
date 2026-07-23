import fs from 'node:fs';
import ts from 'typescript';

export function stateExportViolations(
  file: string,
  relativeFile: (file: string) => string
): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  return source.statements.flatMap((statement) => {
    if (ts.isExportDeclaration(statement)) {
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
          isAtomInitializer(declaration.initializer)
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

function isAtomInitializer(initializer: ts.Expression): boolean {
  const expression =
    ts.isAsExpression(initializer) ||
    ts.isSatisfiesExpression(initializer) ||
    ts.isParenthesizedExpression(initializer)
      ? initializer.expression
      : initializer;
  return (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'atom'
  );
}
