import ts from 'typescript';
import { createSelectorCertificateProof } from './query-selector-certificates.mjs';

const pass = Object.freeze({ ok: true });
const fail = (reason, transient = false) => ({ ok: false, reason, transient });
const isConst = (declaration) => ts.isVariableDeclarationList(declaration.parent) &&
  Boolean(declaration.parent.flags & ts.NodeFlags.Const);
const symbolDeclarations = (checker, node) => {
  // A shorthand name's ordinary symbol denotes the newly created property.
  // Follow its value binding instead; the same immutable-origin proof below
  // must still establish the actual query or frozen nested container.
  const symbol = ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent) &&
      node.parent.name === node
    ? checker.getShorthandAssignmentValueSymbol(node.parent)
    : checker.getSymbolAtLocation(node);
  const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol) : symbol;
  return resolved?.declarations ?? [];
};

/**
 * Bounded proof of immutable query leaves and genuinely frozen finite data.
 * Closed numeric switches over eager leaves and local pure identity forwarding
 * are admitted. Maps and arbitrary selectors remain unsupported; annotations
 * never prove origin.
 * Like the accepted defineQuery implementation, this proof assumes standard JS
 * built-in semantics. It checks actual binding origins and query-bearing source
 * structure; it does not establish an ambient-runtime integrity policy.
 */
export function createStaticQueryProof(semantics, isDataModule) {
  const { checker, pathOf, trustedTsFunction, filename, program } = semantics;
  const composedSelector = createSelectorCertificateProof(semantics, isDataModule);
  const memo = new WeakMap();
  const pending = new Set();
  let work = 0;

  const isNamespace = (node, seen = new Set()) => {
    if (!ts.isIdentifier(node) || seen.has(node) || seen.size > 64) return false;
    seen.add(node);
    return checker.getSymbolAtLocation(node)?.declarations?.some((declaration) =>
      ts.isNamespaceImport(declaration) ||
      (ts.isVariableDeclaration(declaration) && isConst(declaration) &&
        declaration.initializer && isNamespace(declaration.initializer, seen)),
    ) ?? false;
  };

  // The cold integration-template executable builds before importing. Admit
  // only that exact native import binding; a TypedQuery-looking namespace or
  // another module/argument cannot provide source-definition provenance.
  const dynamicToolingBinding = (declaration) => {
    if (filename !== 'scripts/ci-local/prepare-int-template.mjs' ||
        !ts.isBindingElement(declaration) || !ts.isObjectBindingPattern(declaration.parent) ||
        declaration.dotDotDotToken || declaration.initializer) return undefined;
    const variable = declaration.parent.parent;
    if (!ts.isVariableDeclaration(variable) || !isConst(variable) ||
        !variable.initializer || !ts.isAwaitExpression(variable.initializer)) return undefined;
    const imported = variable.initializer.expression;
    if (!ts.isCallExpression(imported) || imported.expression.kind !== ts.SyntaxKind.ImportKeyword ||
        imported.arguments.length !== 1 || !ts.isStringLiteral(imported.arguments[0]) ||
        !['../../tools/database-tooling/dist/catalog-control.repository.js',
          '../../packages/data/dist/data/src/index.js'].includes(imported.arguments[0].text)) return undefined;
    let fn = variable.parent;
    while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
    if (!fn || !ts.isFunctionDeclaration(fn) || fn.name?.text !== 'main' ||
        !ts.isSourceFile(fn.parent)) return undefined;
    const key = declaration.propertyName ?? declaration.name;
    if (!ts.isIdentifier(key) && !ts.isStringLiteral(key)) return undefined;
    const member = checker.getTypeAtLocation(variable.initializer).getProperty(key.text);
    const resolved = member && member.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(member) : member;
    const declarations = resolved?.declarations;
    const definitionModule = imported.arguments[0].text === '../../tools/database-tooling/dist/catalog-control.repository.js';
    const expectedPath = definitionModule
      ? 'tools/database-tooling/dist/catalog-control.repository.d.ts'
      : 'packages/data/dist/data/src/checked-executor.d.ts';
    if (!definitionModule && key.text !== 'executeTypedQuery') return undefined;
    return declarations?.length === 1 &&
      pathOf(declarations[0].getSourceFile().fileName) === expectedPath
      ? declarations : undefined;
  };

  const namespaceBinding = (declaration) => {
    const dynamic = dynamicToolingBinding(declaration);
    if (dynamic) return dynamic;
    if (!ts.isBindingElement(declaration) || !ts.isObjectBindingPattern(declaration.parent) ||
        declaration.dotDotDotToken || declaration.initializer) return undefined;
    const variable = declaration.parent.parent;
    if (!ts.isVariableDeclaration(variable) || !isConst(variable) || !variable.initializer ||
        !ts.isIdentifier(variable.initializer)) return undefined;
    if (!isNamespace(variable.initializer)) return undefined;
    const key = declaration.propertyName ?? declaration.name;
    if (!ts.isIdentifier(key) && !ts.isStringLiteral(key)) return undefined;
    const symbol = checker.getTypeAtLocation(variable.initializer).getProperty(key.text);
    const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol) : symbol;
    return resolved?.declarations;
  };

  const shapeMemo = new WeakMap();
  const shapePending = new Set();
  const builtinObjectCall = (node, method) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression) ||
        !ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== 'Object' ||
        node.expression.name.text !== method) return false;
    const root = symbolDeclarations(checker, node.expression.expression);
    const member = symbolDeclarations(checker, node.expression.name);
    return root.some(ts.isVariableDeclaration) && root.every((declaration) =>
      program.isSourceFileDefaultLibrary(declaration.getSourceFile()) &&
      (ts.isVariableDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)) &&
      ts.isIdentifier(declaration.name) && declaration.name.text === 'Object',
    ) && member.length > 0 && member.every((declaration) =>
      program.isSourceFileDefaultLibrary(declaration.getSourceFile()) &&
      ts.isMethodSignature(declaration) && ts.isInterfaceDeclaration(declaration.parent) &&
      declaration.parent.name.text === 'ObjectConstructor',
    );
  };
  const propertyName = (node) => ts.isIdentifier(node) || ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ? node.text : undefined;
  const initializer = (node) => {
    const location = ts.isPropertyAccessExpression(node) && isNamespace(node.expression) ? node.name : node;
    if (!ts.isIdentifier(location)) return undefined;
    const declarations = symbolDeclarations(checker, location);
    if (declarations.length !== 1 || !ts.isVariableDeclaration(declarations[0]) || !isConst(declarations[0])) return undefined;
    return declarations[0].initializer;
  };
  const sameIdentifier = (left, right) => ts.isIdentifier(left) && ts.isIdentifier(right) &&
    checker.getSymbolAtLocation(left) === checker.getSymbolAtLocation(right);
  const throws = (statement) => ts.isThrowStatement(statement) ||
    (ts.isBlock(statement) && statement.statements.length === 1 && ts.isThrowStatement(statement.statements[0]));
  const guardedOwnKey = (node) => {
    if (!ts.isElementAccessExpression(node) || !ts.isIdentifier(node.expression) ||
        !ts.isIdentifier(node.argumentExpression)) return false;
    const key = symbolDeclarations(checker, node.argumentExpression);
    if (key.length !== 1 || !ts.isVariableDeclaration(key[0]) || !isConst(key[0])) return false;
    let statement = node;
    while (statement.parent && !ts.isBlock(statement.parent) && !ts.isSourceFile(statement.parent)) statement = statement.parent;
    if (!statement.parent || (!ts.isBlock(statement.parent) && !ts.isSourceFile(statement.parent))) return false;
    const siblings = statement.parent.statements;
    const index = siblings.indexOf(statement);
    return siblings.slice(0, index).some((previous) => {
      if (!ts.isIfStatement(previous) || !throws(previous.thenStatement) ||
          !ts.isBinaryExpression(previous.expression) ||
          previous.expression.operatorToken.kind !== ts.SyntaxKind.BarBarToken) return false;
      const primitive = previous.expression.left;
      const own = previous.expression.right;
      if (!ts.isBinaryExpression(primitive) || primitive.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken ||
          !ts.isTypeOfExpression(primitive.left) || !sameIdentifier(primitive.left.expression, node.argumentExpression) ||
          !ts.isStringLiteral(primitive.right) || primitive.right.text !== 'string' ||
          !ts.isPrefixUnaryExpression(own) || own.operator !== ts.SyntaxKind.ExclamationToken) return false;
      const check = own.operand;
      return builtinObjectCall(check, 'hasOwn') && check.arguments.length === 2 &&
        sameIdentifier(check.arguments[0], node.expression) &&
        sameIdentifier(check.arguments[1], node.argumentExpression);
    });
  };
  const keyFor = (node) => {
    if (ts.isPropertyAccessExpression(node)) return { ok: true, key: node.name.text };
    const key = node.argumentExpression;
    if (key && (ts.isStringLiteral(key) || ts.isNumericLiteral(key))) return { ok: true, key: key.text };
    return guardedOwnKey(node) ? { ok: true, key: undefined }
      : fail('dynamic container index requires actual primitive-string and own-key guards with a terminating missing-key branch');
  };
  const project = (shapes, key) => {
    if (!shapes.ok) return shapes;
    const nodes = [];
    for (const shape of shapes.values) {
      if (shape.kind !== 'object') return fail('indexed arrays require a separate bounds proof');
      if (key === undefined) nodes.push(...shape.entries.values());
      else if (shape.entries.has(key)) nodes.push(shape.entries.get(key));
      else return fail('selected query property is missing or inherited');
    }
    return nodes.length > 0 ? { ok: true, nodes } : fail('query selection has no own members');
  };
  const selection = (node, depth) => {
    const key = keyFor(node);
    return key.ok ? project(frozenShapes(node.expression, depth + 1), key.key) : key;
  };
  const joinShapes = (nodes, depth) => {
    const values = [];
    for (const node of nodes) {
      const result = frozenShapes(node, depth + 1);
      if (!result.ok) return result;
      values.push(...result.values);
    }
    return { ok: true, values };
  };
  const inspectShape = (node, depth) => {
    if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) {
      return frozenShapes(node.expression, depth + 1);
    }
    const source = initializer(node);
    if (source) return frozenShapes(source, depth + 1);
    if (ts.isConditionalExpression(node)) return joinShapes([node.whenTrue, node.whenFalse], depth + 1);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const selected = selection(node, depth + 1);
      return selected.ok ? joinShapes(selected.nodes, depth + 1) : selected;
    }
    if (!builtinObjectCall(node, 'freeze') || node.arguments.length !== 1) {
      return fail('query-bearing container is not a proven frozen literal');
    }
    let literal = node.arguments[0];
    // `as const` narrows metadata only. Actual freeze calls at every traversed
    // container level are still required; other assertions are not admitted.
    if (ts.isAsExpression(literal) && ts.isTypeReferenceNode(literal.type) &&
        ts.isIdentifier(literal.type.typeName) && literal.type.typeName.text === 'const') literal = literal.expression;
    if (ts.isArrayLiteralExpression(literal)) {
      if (literal.elements.some((element) => ts.isSpreadElement(element) || ts.isOmittedExpression(element))) {
        return fail('array holes or iterable spreads require a separate finite-iteration proof');
      }
      return { ok: true, values: [{ kind: 'array', elements: [...literal.elements] }] };
    }
    if (!ts.isObjectLiteralExpression(literal)) return fail('freeze input must be a fresh literal container');
    const entries = new Map();
    for (const property of literal.properties) {
      if ((!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) ||
          ts.isComputedPropertyName(property.name) ||
          (ts.isShorthandPropertyAssignment(property) && property.objectAssignmentInitializer)) {
        return fail('frozen query containers require explicit data properties, without getters or spreads');
      }
      const key = propertyName(property.name);
      if (key === undefined || key === '__proto__' || entries.has(key)) {
        return fail('duplicate or prototype-setting container property');
      }
      entries.set(key, ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer);
    }
    return { ok: true, values: [{ kind: 'object', entries }] };
  };
  function frozenShapes(node, depth) {
    if (!node) return fail('container source unavailable');
    if (++work > 2048 || depth > 64) return fail('query provenance traversal budget exceeded', true);
    if (shapePending.has(node)) return fail('cyclic container provenance');
    const cached = shapeMemo.get(node);
    if (cached) return cached;
    shapePending.add(node);
    const result = inspectShape(node, depth);
    shapePending.delete(node);
    if (!result.transient) shapeMemo.set(node, result);
    return result;
  }
  const iteration = (variable, depth) => {
    if (!isConst(variable) || !ts.isForOfStatement(variable.parent.parent) ||
        variable.parent.parent.initializer !== variable.parent) return fail('query binding is not a const native-array iteration');
    const shapes = frozenShapes(variable.parent.parent.expression, depth + 1);
    if (!shapes.ok) return shapes;
    const nodes = [];
    for (const shape of shapes.values) {
      if (shape.kind !== 'array') return fail('iteration requires a proven frozen native array');
      nodes.push(...shape.elements);
    }
    return nodes.length > 0 ? { ok: true, nodes } : fail('query iteration is empty');
  };
  const proveAll = (selected, depth) => {
    if (!selected.ok) return selected;
    for (const node of selected.nodes) {
      const result = prove(node, depth + 1);
      if (!result.ok) return result;
    }
    return pass;
  };

  // A pure identity forwarder does not select or manufacture a query. Prove
  // each actual argument independently; never memoize its result by the helper.
  const forwardingClosureMemo = new WeakMap();
  const localForwardingClosure = (binding) => {
    const cached = forwardingClosureMemo.get(binding);
    if (cached) return cached;
    const source = binding.getSourceFile();
    if (!ts.isExternalModule(source)) return fail('forwarding declaration must be module-local');
    const visited = new Set();
    let remaining = 20000;
    const inspectBinding = (declaration) => {
      if (visited.has(declaration)) return pass;
      visited.add(declaration);
      if (visited.size > 64) return fail('forwarder alias closure budget exceeded', true);
      if (!ts.isIdentifier(declaration.name) || declaration.getSourceFile() !== source) {
        return fail('forwarder binding origin is unresolved');
      }
      const statement = ts.isFunctionDeclaration(declaration) ? declaration : declaration.parent.parent;
      if ((!ts.isFunctionDeclaration(declaration) &&
          (!ts.isVariableDeclaration(declaration) || !isConst(declaration) || !ts.isVariableStatement(statement))) ||
          statement.modifiers?.some((modifier) =>
            modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
        return fail('mutable or exported forwarding declaration');
      }
      const symbol = checker.getSymbolAtLocation(declaration.name);
      if (!symbol) return fail('forwarder binding symbol is unavailable');
      let result = pass;
      const scan = (node) => {
        if (!result.ok) return;
        if (--remaining < 0) {
          result = fail('forwarder reference closure budget exceeded', true);
          return;
        }
        if (ts.isExportSpecifier(node) && checker.getExportSpecifierLocalTargetSymbol(node) === symbol) {
          result = fail('forwarder binding is exported');
          return;
        }
        const reference = !ts.isIdentifier(node) ? undefined
          : ts.isShorthandPropertyAssignment(node.parent)
            ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
        if (ts.isIdentifier(node) && node !== declaration.name && reference === symbol) {
          let expression = node;
          while (ts.isParenthesizedExpression(expression.parent)) expression = expression.parent;
          const parent = expression.parent;
          if (ts.isCallExpression(parent) && parent.expression === expression) {
            // The helper's complete body is separately proven below. Passing
            // it elsewhere, mutating it or changing its call receiver is not.
          } else if (ts.isVariableDeclaration(parent) && parent.initializer === expression &&
              ts.isIdentifier(parent.name) && isConst(parent)) {
            result = inspectBinding(parent);
          } else {
            result = fail('forwarder binding is written, exported or escapes direct calls');
          }
        }
        if (result.ok) ts.forEachChild(node, scan);
      };
      scan(source);
      return result;
    };
    const result = inspectBinding(binding);
    if (!result.transient) forwardingClosureMemo.set(binding, result);
    return result;
  };
  const resolveForwarder = (node, seen = new Set()) => {
    if (!node || seen.has(node) || seen.size > 64) return undefined;
    seen.add(node);
    if (ts.isParenthesizedExpression(node)) return resolveForwarder(node.expression, seen);
    if (!ts.isIdentifier(node)) return undefined;
    const declarations = symbolDeclarations(checker, node);
    if (declarations.length !== 1) return undefined;
    const binding = declarations[0];
    if (ts.isFunctionDeclaration(binding)) return { binding, fn: binding };
    if (!ts.isVariableDeclaration(binding) || !isConst(binding) || !binding.initializer) return undefined;
    if (ts.isArrowFunction(binding.initializer) || ts.isFunctionExpression(binding.initializer)) {
      return { binding, fn: binding.initializer };
    }
    return resolveForwarder(binding.initializer, seen);
  };
  const identityForwarder = (call, depth) => {
    const resolved = resolveForwarder(call.expression);
    if (!resolved) return undefined;
    const { binding, fn } = resolved;
    if (!fn.body || fn.parameters.length !== 1 || fn.asteriskToken ||
        fn.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)) return undefined;
    const parameter = fn.parameters[0];
    if (!ts.isIdentifier(parameter.name) || parameter.initializer || parameter.dotDotDotToken) return undefined;
    let returned = fn.body;
    if (ts.isBlock(returned)) {
      if (returned.statements.length !== 1 || !ts.isReturnStatement(returned.statements[0])) return undefined;
      returned = returned.statements[0].expression;
    }
    while (returned && ts.isParenthesizedExpression(returned)) returned = returned.expression;
    if (!returned || !sameIdentifier(returned, parameter.name)) return undefined;
    if (call.arguments.length !== 1 || ts.isSpreadElement(call.arguments[0])) {
      return fail('identity forwarder requires exactly one explicit argument');
    }
    const closure = localForwardingClosure(binding);
    return closure.ok ? prove(call.arguments[0], depth + 1) : closure;
  };

  const selectorMemo = new WeakMap();
  const selectorShape = (declaration) => {
    if (!ts.isArrowFunction(declaration) ||
        !ts.isVariableDeclaration(declaration.parent) || !isConst(declaration.parent) ||
        declaration.parent.initializer !== declaration ||
        !ts.isVariableStatement(declaration.parent.parent.parent) ||
        !ts.isSourceFile(declaration.parent.parent.parent.parent) ||
        !ts.isBlock(declaration.body) ||
        declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ||
        declaration.parameters.length !== 1 || declaration.body.statements.length !== 1) return undefined;
    const parameter = declaration.parameters[0];
    const selection = declaration.body.statements[0];
    if (!ts.isIdentifier(parameter.name) || parameter.initializer || parameter.dotDotDotToken ||
        !ts.isSwitchStatement(selection) || !sameIdentifier(selection.expression, parameter.name)) return undefined;
    const keys = new Set();
    const nodes = [];
    let defaults = 0;
    for (const clause of selection.caseBlock.clauses) {
      if (clause.statements.length !== 1) return undefined;
      if (ts.isDefaultClause(clause)) {
        if (++defaults !== 1 || !ts.isThrowStatement(clause.statements[0])) return undefined;
        continue;
      }
      if (!ts.isNumericLiteral(clause.expression)) return undefined;
      const key = Number(clause.expression.text);
      if (!Number.isFinite(key) || keys.has(key)) return undefined;
      keys.add(key);
      const returned = clause.statements[0];
      if (!ts.isReturnStatement(returned) || !returned.expression || !ts.isIdentifier(returned.expression)) return undefined;
      const leaves = symbolDeclarations(checker, returned.expression);
      if (leaves.length !== 1 || !ts.isVariableDeclaration(leaves[0]) || !isConst(leaves[0]) ||
          !ts.isVariableStatement(leaves[0].parent.parent) || !ts.isSourceFile(leaves[0].parent.parent.parent) ||
          !leaves[0].initializer || !ts.isCallExpression(leaves[0].initializer) ||
          !trustedTsFunction(leaves[0].initializer.expression, 'typed-query', 'defineQuery')) return undefined;
      nodes.push(returned.expression);
    }
    return defaults === 1 && nodes.length > 0 ? { nodes } : undefined;
  };
  const resolveSelector = (node, seen = new Set()) => {
    if (seen.has(node) || seen.size > 64) return undefined;
    seen.add(node);
    if (ts.isParenthesizedExpression(node)) return resolveSelector(node.expression, seen);
    if (!ts.isIdentifier(node) && !(ts.isPropertyAccessExpression(node) && isNamespace(node.expression))) return undefined;
    const declarations = symbolDeclarations(checker, ts.isPropertyAccessExpression(node) ? node.name : node);
    if (declarations.length !== 1) return undefined;
    const declaration = declarations[0];
    if (ts.isVariableDeclaration(declaration) && isConst(declaration) && declaration.initializer) {
      if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) {
        return declaration.initializer;
      }
      return resolveSelector(declaration.initializer, seen);
    }
    return undefined;
  };
  const closedSelector = (call, depth) => {
    if (call.arguments.length !== 1 || ts.isSpreadElement(call.arguments[0])) {
      return fail('only a closed one-key numeric switch selector is proven');
    }
    const declaration = resolveSelector(call.expression);
    if (!declaration) return fail('selector declaration is unresolved or unsupported');
    const cached = selectorMemo.get(declaration);
    if (cached) return cached;
    const selector = selectorShape(declaration);
    if (!selector) return fail('selector must be an immutable numeric switch returning eager query leaves, with a throwing default; Maps remain unsupported');
    // Every branch returns an eager immutable leaf. Unknown keys throw, so this
    // proof has no argument binding environment and cannot reuse a trusted Map
    // proof for an untrusted container supplied at a later call site.
    const result = proveAll({ ok: true, nodes: selector.nodes }, depth + 1);
    if (!result.transient) selectorMemo.set(declaration, result);
    return result;
  };

  // The private native tooling route imports emitted JS. Its adjacent d.ts
  // alone is never evidence: locate the exact source module in this same
  // Program and prove its exported const initializer by the ordinary rules.
  const toolingSourceDeclaration = (declaration) => {
    if (!declaration.getSourceFile().isDeclarationFile ||
        !ts.isVariableDeclaration(declaration) || !isConst(declaration) ||
        !ts.isIdentifier(declaration.name)) return undefined;
    const emitted = pathOf(declaration.getSourceFile().fileName);
    const sourcePath = new Map([
      ['tools/database-tooling/dist/demo-bookmark.repository.d.ts',
        'tools/database-tooling/src/demo-bookmark.repository.ts'],
      ['tools/database-tooling/dist/catalog-control.repository.d.ts',
        'tools/database-tooling/src/catalog-control.repository.ts'],
    ]).get(emitted);
    if (!sourcePath) return undefined;
    const source = program.getSourceFiles().find((candidate) =>
      !candidate.isDeclarationFile && pathOf(candidate.fileName) === sourcePath);
    if (!source) return undefined;
    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (!moduleSymbol) return undefined;
    const exported = checker.getExportsOfModule(moduleSymbol)
      .find((symbol) => symbol.name === declaration.name.text);
    if (!exported || exported.flags & ts.SymbolFlags.Alias || exported.declarations?.length !== 1) return undefined;
    const original = exported.declarations[0];
    if (!ts.isVariableDeclaration(original) || !isConst(original) ||
        !original.initializer || original.getSourceFile() !== source ||
        !ts.isIdentifier(original.name) || original.name.text !== declaration.name.text ||
        !ts.isVariableStatement(original.parent.parent) ||
        !original.parent.parent.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return undefined;
    return original;
  };

  const declarationProof = (declaration, depth) => {
    if (ts.isVariableDeclaration(declaration)) {
      if (!isConst(declaration)) return fail('mutable query binding');
      if (!declaration.initializer) {
        const original = toolingSourceDeclaration(declaration);
        if (original) return declarationProof(original, depth + 1);
        return ts.isForOfStatement(declaration.parent.parent)
          ? proveAll(iteration(declaration, depth + 1), depth + 1)
          : fail('query source initializer unavailable');
      }
      return prove(declaration.initializer, depth + 1);
    }
    if (ts.isBindingElement(declaration)) {
      const declarations = namespaceBinding(declaration);
      if (declarations?.length === 1) return declarationProof(declarations[0], depth + 1);
      if (!ts.isObjectBindingPattern(declaration.parent) || declaration.dotDotDotToken || declaration.initializer) {
        return fail('destructuring requires an explicit non-default object property');
      }
      const variable = declaration.parent.parent;
      const key = propertyName(declaration.propertyName ?? declaration.name);
      if (!ts.isVariableDeclaration(variable) || !isConst(variable) || key === undefined) {
        return fail('destructured query binding is not immutable');
      }
      if (variable.initializer) return proveAll(project(frozenShapes(variable.initializer, depth + 1), key), depth + 1);
      const elements = iteration(variable, depth + 1);
      return elements.ok ? proveAll(project(joinShapes(elements.nodes, depth + 1), key), depth + 1) : elements;
    }
    return fail('query does not resolve to an immutable source initializer');
  };

  const literalDefinition = (node) => {
    if (!pathOf(node.getSourceFile().fileName).endsWith('.repository.ts')) {
      return fail('definition is outside a repository module');
    }
    const options = node.arguments[0];
    if (node.arguments.length !== 1 || !options || !ts.isObjectLiteralExpression(options) ||
        options.properties.some((property) =>
          (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) ||
          ts.isComputedPropertyName(property.name))) {
      return fail('definition options must be explicit data properties');
    }
    const texts = options.properties.filter((property) =>
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === 'text');
    const text = texts.length === 1 && ts.isPropertyAssignment(texts[0]) ? texts[0].initializer : undefined;
    if (!text || !ts.isTaggedTemplateExpression(text) ||
        !ts.isNoSubstitutionTemplateLiteral(text.template) ||
        !trustedTsFunction(text.tag, 'typed-query', 'sql')) {
      return fail('definition text is not a trusted zero-hole SQL literal');
    }
    return pass;
  };

  const inspect = (node, depth) => {
    if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) ||
        ts.isSatisfiesExpression(node)) return prove(node.expression, depth + 1);
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      return fail('type assertions cannot establish query provenance');
    }
    if (ts.isConditionalExpression(node)) {
      const left = prove(node.whenTrue, depth + 1);
      return left.ok ? prove(node.whenFalse, depth + 1) : left;
    }
    if (ts.isIdentifier(node)) {
      const declarations = symbolDeclarations(checker, node);
      return declarations.length === 1
        ? declarationProof(declarations[0], depth + 1)
        : fail('query declaration is unresolved or ambiguous');
    }
    if (ts.isPropertyAccessExpression(node)) {
      // Only module namespaces are admitted here. Reading an ordinary object
      // property needs a separate proof that no alias can overwrite it.
      if (!ts.isIdentifier(node.expression) || !isNamespace(node.expression)) {
        return proveAll(selection(node, depth + 1), depth + 1);
      }
      const declarations = symbolDeclarations(checker, node.name);
      return declarations.length === 1
        ? declarationProof(declarations[0], depth + 1)
        : fail('namespace query source is unavailable');
    }
    if (ts.isElementAccessExpression(node)) return proveAll(selection(node, depth + 1), depth + 1);
    if (ts.isCallExpression(node)) {
      return trustedTsFunction(node.expression, 'typed-query', 'defineQuery')
        ? literalDefinition(node) : (identityForwarder(node, depth + 1) ?? closedSelector(node, depth + 1));
    }
    return fail('unsupported query expression; prove its finite selection and write/escape closure');
  };

  function prove(node, depth = 0) {
    if (!node) return fail('query argument is missing');
    if (++work > 2048 || depth > 64) return fail('query provenance traversal budget exceeded', true);
    if (pending.has(node)) return fail('cyclic query provenance');
    const cached = memo.get(node);
    if (cached) return cached;
    pending.add(node);
    const result = inspect(node, depth);
    pending.delete(node);
    if (!result.transient) memo.set(node, result);
    return result;
  }

  const expectedCallable = (declaration, entry) => {
    if (!declaration.name || !ts.isIdentifier(declaration.name) || declaration.name.text !== entry.name) return false;
    const origin = {
      file: pathOf(declaration.getSourceFile().fileName),
      absoluteFile: declaration.getSourceFile().fileName.replaceAll('\\', '/'),
    };
    if (entry.name === 'run' || entry.name === 'runGuarded') {
      return ts.isMethodDeclaration(declaration) && ts.isClassDeclaration(declaration.parent) &&
        declaration.parent.name?.text === 'Transaction' && isDataModule(origin, 'transaction');
    }
    return ts.isFunctionDeclaration(declaration) && isDataModule(origin, 'checked-executor');
  };

  const callable = (node, entry, seen = new Set(), depth = 0) => {
    if (!node || depth > 64 || seen.has(node)) return false;
    seen.add(node);
    if (ts.isParenthesizedExpression(node)) return callable(node.expression, entry, seen, depth + 1);
    if (!ts.isIdentifier(node) && !ts.isPropertyAccessExpression(node)) return false;
    if (ts.isPropertyAccessExpression(node) && ['bind', 'call', 'apply'].includes(node.name.text)) return false;
    const declarations = symbolDeclarations(checker, ts.isPropertyAccessExpression(node) ? node.name : node);
    return declarations.some((declaration) => {
      if (expectedCallable(declaration, entry)) return true;
      if (ts.isVariableDeclaration(declaration) && isConst(declaration)) {
        return callable(declaration.initializer, entry, seen, depth + 1);
      }
      if (ts.isBindingElement(declaration)) {
        const imported = namespaceBinding(declaration);
        if (imported?.some((candidate) => expectedCallable(candidate, entry))) return true;
        const binding = declaration.parent;
        const variable = binding.parent;
        if (!ts.isObjectBindingPattern(binding) || !ts.isVariableDeclaration(variable) ||
            !isConst(variable) || !variable.initializer || declaration.dotDotDotToken || declaration.initializer) return false;
        const key = declaration.propertyName ?? declaration.name;
        if (!ts.isIdentifier(key) && !ts.isStringLiteral(key)) return false;
        const member = checker.getTypeAtLocation(variable.initializer).getProperty(key.text);
        return member?.declarations?.some((candidate) => expectedCallable(candidate, entry)) ?? false;
      }
      return false;
    });
  };

  const internalForwarding = (call, entry) => {
    if (filename !== 'packages/data/src/transaction.ts') return false;
    const methodName = entry.name === 'executeTypedQuery' ? 'run'
      : entry.name === 'executeGuardedQueryRows' ? 'runGuarded' : undefined;
    if (!methodName || call.arguments.length !== (methodName === 'run' ? 3 : 4)) return false;
    let parent = call.parent;
    while (parent && !ts.isFunctionLike(parent)) parent = parent.parent;
    if (!parent || !ts.isMethodDeclaration(parent) || !ts.isIdentifier(parent.name) ||
        parent.name.text !== methodName || !ts.isClassDeclaration(parent.parent) ||
        parent.parent.name?.text !== 'Transaction' || !ts.isSourceFile(parent.parent.parent)) return false;
    if (!parent.body || parent.body.statements.length !== 2 ||
        parent.parameters.some((parameter) => parameter.initializer || parameter.dotDotDotToken)) return false;
    const [preflight, forwarded] = parent.body.statements;
    if (!ts.isExpressionStatement(preflight) || !ts.isCallExpression(preflight.expression) ||
        preflight.expression.arguments.length !== 0 || !ts.isPropertyAccessExpression(preflight.expression.expression) ||
        preflight.expression.expression.expression.kind !== ts.SyntaxKind.ThisKeyword ||
        preflight.expression.expression.name.text !== 'ensureActive' ||
        !ts.isReturnStatement(forwarded) || forwarded.expression !== call) return false;
    // The exact two-statement body has no assignment, alias, nested callback or
    // parameter initializer that could replace the original query parameter.
    const parameter = parent.parameters[0];
    const query = call.arguments[1];
    const client = call.arguments[0];
    return parameter && ts.isIdentifier(parameter.name) && ts.isIdentifier(query) &&
      checker.getSymbolAtLocation(query) === checker.getSymbolAtLocation(parameter.name) &&
      ts.isPropertyAccessExpression(client) && client.expression.kind === ts.SyntaxKind.ThisKeyword &&
      client.name.text === 'client';
  };

  return (call, entry) => {
    work = 0;
    if (!callable(call.expression, entry)) {
      return fail('callee alias, receiver or invocation arguments are not proven; call/apply/bind need explicit proof');
    }
    if (call.arguments.some(ts.isSpreadElement)) return fail('spread invocation arguments are not proven');
    if (internalForwarding(call, entry)) return pass;
    const argument = call.arguments[entry.name === 'run' || entry.name === 'runGuarded' ? 0 : 1];
    // Composition is checked afresh at the root, before any ordinary memo can
    // discount its complete graph cost. Nested composition stays unsupported.
    return composedSelector(argument) ?? prove(argument);
  };
}
