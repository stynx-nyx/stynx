import ts from 'typescript';

// Recover only targets of actual standard reflection intrinsics. This is not a
// ban on reflection: the caller still classifies each recovered SQL declaration.
// Unsupported arguments remain unknown; no evaluated code or asserted type is
// used as evidence of the intrinsic's identity.
export function reflectedCallTargets(call, { checker, program }) {
  const pending = new Set();
  let work = 0;
  const declarations = (node) => {
    const symbol = checker.getSymbolAtLocation(node);
    const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol) : symbol;
    return resolved?.declarations ?? [];
  };
  const standard = (node) => {
    const found = declarations(node);
    return found.length > 0 && found.every((declaration) =>
      program.isSourceFileDefaultLibrary(declaration.getSourceFile()));
  };
  const member = (node) => {
    if (ts.isPropertyAccessExpression(node)) return { receiver: node.expression, name: node.name.text, key: node.name };
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
      return { receiver: node.expression, name: node.argumentExpression.text, key: node };
    }
    return undefined;
  };
  const standardMember = (slot) => {
    if (!slot) return false;
    const found = checker.getTypeAtLocation(slot.receiver).getProperty(slot.name)?.declarations ?? [];
    return found.length > 0 && found.every((declaration) =>
      program.isSourceFileDefaultLibrary(declaration.getSourceFile()));
  };
  const isConst = (declaration) => ts.isVariableDeclarationList(declaration.parent) &&
    Boolean(declaration.parent.flags & ts.NodeFlags.Const);
  const stableMemo = new WeakMap();
  const stableBinding = (declaration) => {
    if (isConst(declaration)) return true;
    if (stableMemo.has(declaration)) return stableMemo.get(declaration);
    if (!ts.isIdentifier(declaration.name) || !ts.isVariableStatement(declaration.parent.parent) ||
        declaration.parent.parent.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return false;
    const symbol = checker.getSymbolAtLocation(declaration.name);
    const target = (node) => {
      if (ts.isIdentifier(node)) return checker.getSymbolAtLocation(node) === symbol;
      if (ts.isParenthesizedExpression(node) || ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) return target(node.expression);
      if (ts.isArrayLiteralExpression(node)) return node.elements.some(target);
      if (ts.isObjectLiteralExpression(node)) return node.properties.some((property) =>
        ts.isShorthandPropertyAssignment(property) ? target(property.name)
          : ts.isPropertyAssignment(property) ? target(property.initializer)
            : ts.isSpreadAssignment(property) && target(property.expression));
      return false;
    };
    let stable = true;
    const scan = (node) => {
      if (!stable) return;
      if ((ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
            node.operatorToken.kind <= ts.SyntaxKind.LastAssignment && target(node.left)) ||
          ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
            [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator) && target(node.operand)) ||
          ((ts.isForOfStatement(node) || ts.isForInStatement(node)) && target(node.initializer)) ||
          (ts.isExportSpecifier(node) && (node.propertyName ?? node.name).text === declaration.name.text)) {
        stable = false;
        return;
      }
      ts.forEachChild(node, scan);
    };
    scan(declaration.getSourceFile());
    stableMemo.set(declaration, stable);
    return stable;
  };
  const globalRoot = (node, name, seen = new Set()) => {
    if (!node || seen.has(node) || seen.size > 64) return false;
    seen.add(node);
    if (ts.isIdentifier(node)) {
      if (node.text === name && standard(node)) return true;
      return declarations(node).some((declaration) => ts.isVariableDeclaration(declaration) &&
        stableBinding(declaration) && declaration.initializer && globalRoot(declaration.initializer, name, seen));
    }
    const slot = member(node);
    if (!slot || slot.name !== name || !standardMember(slot) ||
        !ts.isIdentifier(slot.receiver) || slot.receiver.text !== 'globalThis') return false;
    const symbol = checker.getSymbolAtLocation(slot.receiver);
    return symbol?.name === 'globalThis' && !symbol.declarations?.length;
  };
  const unwrap = (node) => {
    while (node && ts.isParenthesizedExpression(node)) node = node.expression;
    return node;
  };
  const arrayArguments = (node) => {
    node = unwrap(node);
    return node && ts.isArrayLiteralExpression(node) &&
      node.elements.every((element) => !ts.isSpreadElement(element) && !ts.isOmittedExpression(element))
      ? [...node.elements] : [];
  };
  const visit = (raw, args, receiver, depth = 0) => {
    const node = unwrap(raw);
    if (!node || depth > 64 || ++work > 2048 || pending.has(node)) return [];
    pending.add(node);
    try {
      if (ts.isIdentifier(node)) {
        for (const declaration of declarations(node)) {
          if (ts.isVariableDeclaration(declaration) && stableBinding(declaration) && declaration.initializer) {
            return visit(declaration.initializer, args, receiver, depth + 1);
          }
          if (ts.isBindingElement(declaration) && !declaration.dotDotDotToken && !declaration.initializer &&
              ts.isObjectBindingPattern(declaration.parent)) {
            const variable = declaration.parent.parent;
            const key = declaration.propertyName ?? declaration.name;
            if (ts.isVariableDeclaration(variable) && isConst(variable) && variable.initializer &&
                (ts.isIdentifier(key) || ts.isStringLiteral(key)) && key.text === 'apply' &&
                globalRoot(variable.initializer, 'Reflect')) return args[0] ? [args[0]] : [];
          }
        }
        return [];
      }
      const bound = ts.isCallExpression(node) ? member(node.expression) : undefined;
      if (bound?.name === 'bind' && standardMember(bound) && !node.arguments.some(ts.isSpreadElement)) {
        return visit(bound.receiver, [...node.arguments.slice(1), ...args],
          node.arguments[0], depth + 1);
      }
      const slot = member(node);
      if (!slot) return [];
      if (slot.name === 'apply' && globalRoot(slot.receiver, 'Reflect') && standardMember(slot)) {
        return args[0] ? [args[0]] : [];
      }
      const prototype = member(slot.receiver);
      if (['apply', 'call'].includes(slot.name) && standardMember(slot) &&
          prototype?.name === 'prototype' && globalRoot(prototype.receiver, 'Function')) return receiver ? [receiver] : [];
      if (slot.name === 'call' && standardMember(slot)) {
        return visit(slot.receiver, args.slice(1), args[0], depth + 1);
      }
      if (slot.name === 'apply' && standardMember(slot)) {
        return visit(slot.receiver, arrayArguments(args[1]), args[0], depth + 1);
      }
      return [];
    } finally {
      pending.delete(node);
    }
  };
  return visit(call.expression, [...call.arguments], undefined);
}
