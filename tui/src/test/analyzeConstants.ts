import fs from 'node:fs';
import ts from 'typescript';

export function constantViolations(
  file: string,
  relativeFile: (file: string) => string
): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const violations: string[] = [];
  const visit = (node: ts.Node): void => {
    if (isForbiddenConstantSyntax(node)) {
      violations.push(`${relativeFile(file)}:${ts.SyntaxKind[node.kind]}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        declaration.initializer !== undefined &&
        containsObjectOrArrayLiteral(declaration.initializer) &&
        !hasReadonlyDeclaration(declaration, source)
      ) {
        const name = ts.isIdentifier(declaration.name) ? declaration.name.text : '<binding>';
        violations.push(`${relativeFile(file)}:${name}:mutable`);
      }
    }
  }
  return violations;
}

function isForbiddenConstantSyntax(node: ts.Node): boolean {
  return (
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
    ts.isDeleteExpression(node) ||
    ts.isConditionalExpression(node) ||
    (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) ||
    (ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) ||
    ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)) ||
    (ts.isVariableStatement(node) &&
      (node.declarationList.flags & ts.NodeFlags.Const) === 0)
  );
}

function containsObjectOrArrayLiteral(node: ts.Expression): boolean {
  const expression = unwrapExpression(node);
  return ts.isObjectLiteralExpression(expression) || ts.isArrayLiteralExpression(expression);
}

function hasReadonlyDeclaration(
  declaration: ts.VariableDeclaration,
  _source: ts.SourceFile
): boolean {
  if (
    declaration.initializer !== undefined &&
    hasConstAssertion(declaration.initializer)
  ) {
    return true;
  }
  return declaration.type !== undefined && isDeepReadonlyType(declaration.type);
}

function isDeepReadonlyType(type: ts.TypeNode): boolean {
  if (ts.isTypeOperatorNode(type) && type.operator === ts.SyntaxKind.ReadonlyKeyword) {
    if (ts.isArrayTypeNode(type.type)) {
      return isDeepReadonlyType(type.type.elementType);
    }
    if (ts.isTupleTypeNode(type.type)) {
      return type.type.elements.every(isDeepReadonlyType);
    }
    return isDeepReadonlyType(type.type);
  }
  if (ts.isArrayTypeNode(type)) {
    return false;
  }
  if (ts.isTupleTypeNode(type)) {
    return type.elements.every(isDeepReadonlyType);
  }
  if (ts.isNamedTupleMember(type)) {
    return isDeepReadonlyType(type.type);
  }
  if (ts.isTypeLiteralNode(type)) {
    return type.members.every((member) => {
      if (!ts.isPropertySignature(member) || member.type === undefined) return false;
      const readonly = member.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword
      );
      return readonly === true && isDeepReadonlyType(member.type);
    });
  }
  if (ts.isTypeReferenceNode(type)) {
    const name = type.typeName.getText();
    if (name === 'ReadonlyArray') {
      return type.typeArguments?.every(isDeepReadonlyType) === true;
    }
    if (name === 'Readonly') {
      return (
        type.typeArguments?.every((argument) =>
          ts.isTypeLiteralNode(argument)
            ? argument.members.every(
                (member) =>
                  ts.isPropertySignature(member) &&
                  member.type !== undefined &&
                  isDeepReadonlyType(member.type)
              )
            : false
        ) === true
      );
    }
    return false;
  }
  if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) {
    return type.types.every(isDeepReadonlyType);
  }
  return (
    IMMUTABLE_TYPE_KINDS.has(type.kind) ||
    ts.isLiteralTypeNode(type) ||
    ts.isFunctionTypeNode(type)
  );
}

const IMMUTABLE_TYPE_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AnyKeyword,
  ts.SyntaxKind.BigIntKeyword,
  ts.SyntaxKind.BooleanKeyword,
  ts.SyntaxKind.NeverKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.NumberKeyword,
  ts.SyntaxKind.StringKeyword,
  ts.SyntaxKind.SymbolKeyword,
  ts.SyntaxKind.UndefinedKeyword,
  ts.SyntaxKind.UnknownKeyword,
  ts.SyntaxKind.VoidKeyword
]);

function hasConstAssertion(expression: ts.Expression): boolean {
  if (
    ts.isAsExpression(expression) &&
    expression.type.getText() === 'const'
  ) {
    return true;
  }
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return hasConstAssertion(expression.expression);
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
