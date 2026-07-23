import fs from 'node:fs';
import ts from 'typescript';

export function analyzeModulePolicy(
  files: string[],
  relativeFile: (file: string) => string
) {
  return {
    componentExportViolations: files
      .filter((file) => {
        const relative = relativeFile(file);
        return relative.startsWith('components/') && !relative.includes('/__tests__/');
      })
      .flatMap((file) => componentExportViolations(file, relativeFile))
      .sort(),
    constantViolations: files
      .filter((file) => relativeFile(file).startsWith('constants/'))
      .flatMap((file) => constantViolations(file, relativeFile))
  };
}

function componentExportViolations(
  file: string,
  relativeFile: (file: string) => string
): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  return source.statements.flatMap((statement) => {
    if (ts.isExportDeclaration(statement)) {
      const names =
        statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)
          ? statement.exportClause.elements.map((element) => element.name.text)
          : ['*'];
      return names.map((name) => `${relativeFile(file)}:${name}`);
    }
    if (ts.isExportAssignment(statement)) {
      return [`${relativeFile(file)}:default`];
    }
    if (
      !ts.canHaveModifiers(statement) ||
      !ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      return [];
    }
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name !== undefined &&
      isComponentName(statement.name.text, file)
    ) {
      return [];
    }
    if (
      ts.isClassDeclaration(statement) &&
      statement.name !== undefined &&
      isComponentName(statement.name.text, file)
    ) {
      return [];
    }
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.flatMap((declaration) => {
        if (
          ts.isIdentifier(declaration.name) &&
          isComponentName(declaration.name.text, file) &&
          declaration.initializer !== undefined &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
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
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name !== undefined
        ? statement.name.text
        : '<anonymous>';
    return [`${relativeFile(file)}:${name}`];
  });
}

function isComponentName(name: string, file: string): boolean {
  return file.endsWith('.tsx') && /^[A-Z]/.test(name);
}

function constantViolations(
  file: string,
  relativeFile: (file: string) => string
): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const violations: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) ||
      ts.isCallExpression(node) ||
      ts.isNewExpression(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      (ts.isVariableStatement(node) &&
        (node.declarationList.flags & ts.NodeFlags.Const) === 0)
    ) {
      violations.push(`${relativeFile(file)}:${ts.SyntaxKind[node.kind]}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}
