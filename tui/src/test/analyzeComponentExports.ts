import fs from 'node:fs';
import ts from 'typescript';

export function componentExportViolations(
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
    if (!isExported(statement)) {
      return [];
    }
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name !== undefined &&
      isComponentFunction(statement.name.text, statement, file)
    ) {
      return [];
    }
    if (
      ts.isClassDeclaration(statement) &&
      statement.name !== undefined &&
      isComponentClass(statement.name.text, statement, file)
    ) {
      return [];
    }
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.flatMap((declaration) => {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer !== undefined &&
          isComponentVariable(declaration.name.text, declaration.initializer, file)
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

function isExported(statement: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement)?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    ) ?? false)
  );
}

function isComponentFunction(
  name: string,
  declaration: ts.FunctionDeclaration,
  file: string
): boolean {
  return isComponentName(name, file) && returnsReactNode(declaration);
}

function isComponentClass(
  name: string,
  declaration: ts.ClassDeclaration,
  file: string
): boolean {
  if (!isComponentName(name, file)) return false;
  const extendsReactComponent = declaration.heritageClauses?.some(
    (clause) =>
      clause.token === ts.SyntaxKind.ExtendsKeyword &&
      clause.types.some((type) => {
        const base = type.expression.getText();
        return (
          base === 'Component' ||
          base === 'PureComponent' ||
          base === 'React.Component' ||
          base === 'React.PureComponent'
        );
      })
  );
  if (extendsReactComponent !== true) return false;
  const render = declaration.members.find(
    (member): member is ts.MethodDeclaration =>
      ts.isMethodDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text === 'render'
  );
  return render !== undefined && returnsReactNode(render);
}

function isComponentVariable(name: string, initializer: ts.Expression, file: string): boolean {
  if (!isComponentName(name, file)) return false;
  const expression = unwrapExpression(initializer);
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return returnsReactNode(expression);
  }
  if (!ts.isCallExpression(expression)) return false;
  const callee = ts.isIdentifier(expression.expression)
    ? expression.expression.text
    : ts.isPropertyAccessExpression(expression.expression)
      ? expression.expression.name.text
      : '';
  if (callee !== 'memo' && callee !== 'forwardRef') return false;
  const render = expression.arguments.find(
    (argument): argument is ts.ArrowFunction | ts.FunctionExpression =>
      ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)
  );
  return render !== undefined && returnsReactNode(render);
}

function returnsReactNode(declaration: ts.FunctionLikeDeclaration): boolean {
  const body = declaration.body;
  if (body === undefined) return false;
  if (!ts.isBlock(body)) return isReactExpression(body);

  const returns: ts.ReturnStatement[] = [];
  const visit = (node: ts.Node): void => {
    if (node !== body && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) {
      returns.push(node);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return (
    returns.length > 0 &&
    returns.every((statement) =>
      statement.expression === undefined || isReactExpression(statement.expression)
    )
  );
}

function isReactExpression(expression: ts.Expression): boolean {
  const value = unwrapExpression(expression);
  if (
    value.kind === ts.SyntaxKind.NullKeyword ||
    ts.isJsxElement(value) ||
    ts.isJsxSelfClosingElement(value) ||
    ts.isJsxFragment(value)
  ) {
    return true;
  }
  if (ts.isConditionalExpression(value)) {
    return isReactExpression(value.whenTrue) && isReactExpression(value.whenFalse);
  }
  return false;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }
  return expression;
}

function isComponentName(name: string, file: string): boolean {
  return file.endsWith('.tsx') && /^[A-Z]/.test(name);
}
